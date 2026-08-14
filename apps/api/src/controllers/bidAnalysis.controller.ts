import type { Request, Response } from "express";
import {
  BID_FRONTLOAD_MIN_SHARE,
  BID_FRONTLOAD_RATIO,
  BID_OUTLIER_PCT,
  BID_RICH_RATIO,
  BID_UNDERWATER_RATIO,
  EstimateTier,
  TenderStatus,
  type BidAnalysis,
  type BidAnalysisEntry,
  type BidAnalysisLine,
  type BidMarginRead,
  type BidRiskFlag,
} from "@buildora/shared";
import { askAi, isAiConfigured } from "../services/ai";
import { percentDiff } from "../services/bidAnalysis";
import { Bid } from "../models/Bid";
import { CostEstimateSnapshot } from "../models/CostEstimateSnapshot";
import { findTenderOr404, settleDeadline } from "./tenders.controller";
import { refId } from "../utils/refId";

/**
 * The owner's read on the bids they have received.
 *
 * This is the counterpart to the contractor's `bidSanityCheck`, and the two are
 * deliberately asymmetric. A contractor gets directions and coarse bands,
 * because the benchmark they'd be measured against is the owner's own position.
 * The owner gets everything, including their guide rates — measuring bids
 * against them is the entire reason those rates exist (see models/BoqRate.ts).
 *
 * Every comparison here is arithmetic. The model reads the finished findings
 * and frames them as risk; it never decides which bid is better, and the prompt
 * forbids it from trying.
 */

/**
 * POST /api/tenders/:id/bid-analysis
 *
 * Gated to *this tender's owner*. Being a land owner is not enough, and neither
 * is being able to read the tender — a rival contractor must never see this.
 * Bids also stay sealed until bidding closes, including from the owner, so an
 * open tender is refused rather than analysed.
 */
export async function bidAnalysis(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;

  await settleDeadline(tender);

  // 404 rather than 403, so the endpoint says nothing about tenders the caller
  // has no part in.
  if (refId(tender.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Tender not found" } });
  }
  if (tender.status === TenderStatus.DRAFT || tender.status === TenderStatus.OPEN) {
    return res.status(400).json({
      error: { message: "Bids stay sealed until bidding closes, including from you" },
    });
  }

  const bids = await Bid.find({ tender: tender._id }).populate({
    path: "contractor",
    select: "name username profile.company ratingAvg ratingCount",
  });

  const empty: BidAnalysis = {
    guideTotalBdt: null,
    estimateTotalBdt: null,
    estimateTier: null,
    bids: [],
    narrative: null,
  };
  if (bids.length === 0) return res.json({ data: { analysis: empty } });

  const itemsById = new Map(tender.items.map((i) => [i.id, i]));

  // The owner's own guide total for exactly these quantities.
  const guideSum = tender.items.reduce((sum, i) => sum + (i.guideRateBdt ?? 0) * i.quantity, 0);
  const guideTotalBdt = guideSum > 0 ? guideSum : null;

  // The median rate each line attracted, so a bid reads against its rivals as
  // well as against the guide.
  const medianByItem = new Map<string, number>();
  for (const item of tender.items) {
    const rates = bids
      .flatMap((b) => b.lines.filter((l) => l.itemId === item.id))
      .map((l) => l.ratePerUnitBdt)
      .sort((a, b) => a - b);
    if (rates.length === 0) continue;
    const mid = Math.floor(rates.length / 2);
    medianByItem.set(
      item.id,
      rates.length % 2 === 0 ? (rates[mid - 1]! + rates[mid]!) / 2 : rates[mid]!
    );
  }

  const timelines = bids.map((b) => b.timelineWeeks).sort((a, b) => a - b);
  const medianTimeline = timelines[Math.floor(timelines.length / 2)]!;

  // The estimate as it stood *before* bidding. Comparing against a BID_BACKED
  // snapshot would be comparing the bids against themselves.
  const priorEstimate = await CostEstimateSnapshot.findOne({
    project: tender.project,
    tier: { $ne: EstimateTier.BID_BACKED },
  }).sort({ createdAt: -1 });

  const entries: BidAnalysisEntry[] = bids.map((bid) => {
    const contractor = bid.contractor as unknown as {
      name: string;
      profile?: { company?: string };
      ratingAvg?: number;
      ratingCount?: number;
    };

    const lines: BidAnalysisLine[] = [];
    let underwaterLines = 0;
    // The most a single line's share of this bid exceeds that same line's share
    // of the guide total. See BID_FRONTLOAD_RATIO for why it's measured this way.
    let worstShareRatio = 0;

    for (const line of bid.lines) {
      const item = itemsById.get(line.itemId);
      if (!item) continue;

      const guide = item.guideRateBdt ?? null;
      const median = medianByItem.get(item.id) ?? null;

      let margin: BidMarginRead | null = null;
      if (guide && guide > 0) {
        const ratio = line.ratePerUnitBdt / guide;
        margin =
          ratio < BID_UNDERWATER_RATIO
            ? "underwater"
            : ratio > BID_RICH_RATIO
              ? "rich"
              : ratio < 0.95
                ? "thin"
                : "normal";
        if (margin === "underwater") underwaterLines += 1;
      }

      // Front-loading shows up as a line taking a bigger slice of this bid than
      // the same line takes of the guide — not merely as a big line.
      if (bid.totalBdt > 0 && guide && guideTotalBdt) {
        const bidShare = line.amountBdt / bid.totalBdt;
        const guideShare = (guide * item.quantity) / guideTotalBdt;
        if (guideShare > 0 && bidShare >= BID_FRONTLOAD_MIN_SHARE) {
          worstShareRatio = Math.max(worstShareRatio, bidShare / guideShare);
        }
      }

      lines.push({
        itemId: item.id,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        bidRateBdt: line.ratePerUnitBdt,
        guideRateBdt: guide,
        medianRateBdt: median != null ? Math.round(median) : null,
        vsGuidePct:
          guide && guide > 0 ? Math.round(percentDiff(line.ratePerUnitBdt, guide) * 10) / 10 : null,
        vsMedianPct:
          median && median > 0
            ? Math.round(percentDiff(line.ratePerUnitBdt, median) * 10) / 10
            : null,
        margin,
      });
    }

    const overallRatio = guideTotalBdt ? bid.totalBdt / guideTotalBdt : null;
    const margin: BidMarginRead =
      overallRatio == null
        ? "normal"
        : overallRatio < BID_UNDERWATER_RATIO
          ? "underwater"
          : overallRatio > BID_RICH_RATIO
            ? "rich"
            : overallRatio < 0.95
              ? "thin"
              : "normal";

    const riskFlags: BidRiskFlag[] = [];
    if (margin === "underwater") riskFlags.push("BELOW_COST_OVERALL");
    if (underwaterLines > 0) riskFlags.push("LINES_UNDERWATER");
    if (bids.length > 1 && bid.timelineWeeks < medianTimeline * 0.7) {
      riskFlags.push("TIMELINE_OPTIMISTIC");
    }
    // Unbalanced bidding: a line taking far more of this bid than it takes of
    // the guide means cash leaves escrow early relative to work actually done.
    if (tender.items.length > 3 && worstShareRatio >= BID_FRONTLOAD_RATIO) {
      riskFlags.push("SINGLE_LINE_LOADED");
    }
    if (
      contractor.ratingCount &&
      contractor.ratingCount >= 3 &&
      (contractor.ratingAvg ?? 5) < 3.5
    ) {
      riskFlags.push("LOW_RATING");
    }

    return {
      bidId: bid._id.toString(),
      contractorName: contractor.profile?.company || contractor.name,
      totalBdt: bid.totalBdt,
      timelineWeeks: bid.timelineWeeks,
      vsGuideTotalPct: guideTotalBdt
        ? Math.round(percentDiff(bid.totalBdt, guideTotalBdt) * 10) / 10
        : null,
      vsEstimateBdt: priorEstimate ? bid.totalBdt - priorEstimate.totalBdt : null,
      margin,
      underwaterLines,
      riskFlags,
      // Worst gap first, so the owner sees what matters without scrolling.
      notableLines: lines
        .filter((l) => l.vsGuidePct != null && Math.abs(l.vsGuidePct) >= BID_OUTLIER_PCT)
        .sort((a, b) => Math.abs(b.vsGuidePct!) - Math.abs(a.vsGuidePct!))
        .slice(0, 5),
    };
  });

  const analysis: BidAnalysis = {
    guideTotalBdt,
    estimateTotalBdt: priorEstimate?.totalBdt ?? null,
    estimateTier: priorEstimate?.tier ?? null,
    bids: entries.sort((a, b) => a.totalBdt - b.totalBdt),
    narrative: null,
  };

  analysis.narrative = await narrate(analysis);
  return res.json({ data: { analysis } });
}

/**
 * Writes the owner's read.
 *
 * The framing rule matters as much as the figures. These are claims about named
 * professionals on the platform, so every finding is put as a risk to the owner
 * and a question worth asking, never as an accusation — a low price is usually
 * a leaner crew or a different specification, not bad faith. The model is also
 * barred from naming a winner: that decision is the owner's, and the platform
 * has no business making it for them.
 */
async function narrate(analysis: BidAnalysis): Promise<string | null> {
  if (!isAiConfigured() || analysis.bids.length === 0) return null;

  const bidLines = analysis.bids
    .map((b) => {
      const flags = b.riskFlags.length ? ` | flags: ${b.riskFlags.join(", ")}` : "";
      const notable = b.notableLines
        .map(
          (l) =>
            `    ${l.description}: bid ${l.bidRateBdt} per ${l.unit} against guide ${l.guideRateBdt} (${l.vsGuidePct! > 0 ? "+" : ""}${l.vsGuidePct}%)`
        )
        .join("\n");
      const vsGuide =
        b.vsGuideTotalPct != null
          ? `, ${b.vsGuideTotalPct > 0 ? "+" : ""}${b.vsGuideTotalPct}% against your guide total`
          : "";
      return `- ${b.contractorName}: ${b.totalBdt} BDT over ${b.timelineWeeks} weeks${vsGuide} | margin read: ${b.margin}${flags}${notable ? `\n${notable}` : ""}`;
    })
    .join("\n");

  const prompt = `You are advising a land owner in Bangladesh who has just closed a construction tender and is comparing the bids received.

These figures are already calculated. Do NOT recalculate them:
${analysis.guideTotalBdt ? `Your own guide total for these quantities: ${analysis.guideTotalBdt} BDT` : "There is no guide total for these quantities."}
${analysis.estimateTotalBdt ? `Your cost estimate before bidding opened: ${analysis.estimateTotalBdt} BDT` : ""}

Bids received:
${bidLines}

What the flags mean:
- BELOW_COST_OVERALL and LINES_UNDERWATER: priced under what the work is reckoned to cost.
- TIMELINE_OPTIMISTIC: much faster than the other bidders quoted.
- SINGLE_LINE_LOADED: one line carries a disproportionate share of the total, so money would leave escrow early relative to work actually done.
- LOW_RATING: their rating on the platform is low.

Write two short paragraphs, plain text, no markdown and no headings:
1. How the bids compare on price and timeline, and which specific lines are worth questioning.
2. Where the risk sits, and what to ask each contractor before shortlisting anyone.

Rules:
- Frame every finding as a risk to the owner and as a question to ask. Never say or imply that a contractor is dishonest, cheating or acting in bad faith. A low price is usually a leaner crew or a different specification.
- Do NOT tell the owner which bid to choose, and do not call any bid the best one. That decision is theirs.
- Do not invent any number that is not above.`;

  try {
    const answer = await askAi({ messages: [{ role: "user", content: prompt }], maxTokens: 500 });
    return answer.text || null;
  } catch (err) {
    console.error("[bidanalysis] narrative unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
