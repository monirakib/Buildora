import type { Request, Response } from "express";
import { isValidObjectId, Types, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  BidStatus,
  BuildContractStatus,
  DEFAULT_MILESTONE_TEMPLATE,
  MilestoneStatus,
  NotificationType,
  ProjectStatus,
  TenderStatus,
  UserRole,
  type Bid as BidDto,
  type BidComparison,
  type BidComparisonRow,
} from "@buildora/shared";
import { Bid, type BidDoc } from "../models/Bid";
import { BuildContract } from "../models/BuildContract";
import { Milestone } from "../models/Milestone";
import { Project } from "../models/Project";
import { Tender } from "../models/Tender";
import { notify, preview } from "../services/notifications";
import { refId } from "../utils/refId";
import { findTenderOr404 } from "./tenders.controller";

/**
 * Sealed bidding.
 *
 * The rule the whole module rests on: **while a tender is OPEN, nobody may read
 * a bid they did not write.** Not the other contractors, and not the owner —
 * an owner who could watch bids arrive could leak the lowest to a favourite
 * and have them undercut it. `assertReadable` is the single place that decides
 * this, and every read goes through it.
 *
 * Once bidding closes, the owner gets everything at once: totals, per-line
 * rates, and the median of each line so an outlier stands out.
 */

type ContractorRef = {
  _id: unknown;
  name: string;
  username: string;
  company?: string;
  ratingAvg?: number;
  ratingCount?: number;
};

function toBidDto(doc: HydratedDocument<BidDoc>): BidDto {
  const contractor = doc.contractor as unknown as ContractorRef;
  const hasRating =
    contractor && typeof contractor === "object" && typeof contractor.ratingCount === "number";

  return {
    id: doc._id.toString(),
    tenderId: doc.tender.toString(),
    contractor:
      contractor && "name" in contractor
        ? {
            id: String(contractor._id),
            name: contractor.name,
            username: contractor.username,
            company: contractor.company,
          }
        : { id: String(doc.contractor), name: "", username: "" },
    contractorRating:
      hasRating && (contractor.ratingCount ?? 0) > 0
        ? { avg: contractor.ratingAvg ?? 0, count: contractor.ratingCount ?? 0 }
        : undefined,
    lines: doc.lines.map((l) => ({
      itemId: l.itemId,
      ratePerUnitBdt: l.ratePerUnitBdt,
      amountBdt: l.amountBdt,
    })),
    totalBdt: doc.totalBdt,
    timelineWeeks: doc.timelineWeeks,
    validityDays: doc.validityDays,
    coverLetter: doc.coverLetter,
    status: doc.status,
    submittedAt: doc.submittedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const submitBidSchema = z.object({
  // Rates only. Quantities come from the tender, and the totals are computed
  // here — a client cannot claim a total its own rates don't add up to.
  lines: z
    .array(
      z.object({
        itemId: z.string().trim().min(1).max(40),
        ratePerUnitBdt: z.number().min(0, "A rate can't be negative"),
      })
    )
    .min(1, "Price at least one line"),
  timelineWeeks: z.number().int().min(1, "How many weeks?").max(520),
  validityDays: z.number().int().min(1, "How long does this price stand?").max(365),
  coverLetter: z.string().trim().max(3000).optional(),
});

/**
 * POST /api/tenders/:id/bids — submit or revise a sealed bid.
 *
 * Re-submitting overwrites: a contractor has one bid per tender (enforced by a
 * unique index), and revising before the deadline is normal practice.
 */
export async function submitBid(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;

  if (req.auth!.role !== UserRole.CONTRACTOR) {
    return res.status(403).json({ error: { message: "Only contractors can bid" } });
  }
  if (tender.status !== TenderStatus.OPEN) {
    return res.status(409).json({
      error: {
        message:
          tender.status === TenderStatus.DRAFT
            ? "Tender not found"
            : "Bidding has closed on this tender",
      },
    });
  }

  const parsed = submitBidSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid bid",
        details: parsed.error.issues,
      },
    });
  }

  // Every line of the tender must be priced — a partial bid can't be compared
  // against a complete one, and silently treating a missing line as free would
  // hand that contractor an unearned advantage.
  const quantities = new Map(tender.items.map((i) => [i.id, i.quantity]));
  const priced = new Set(parsed.data.lines.map((l) => l.itemId));
  const missing = tender.items.filter((i) => !priced.has(i.id));
  if (missing.length > 0) {
    return res.status(400).json({
      error: { message: `Price every line — ${missing.length} still blank` },
    });
  }

  const lines = parsed.data.lines
    .filter((l) => quantities.has(l.itemId))
    .map((l) => ({
      itemId: l.itemId,
      ratePerUnitBdt: l.ratePerUnitBdt,
      amountBdt: Math.round(l.ratePerUnitBdt * (quantities.get(l.itemId) ?? 0) * 100) / 100,
    }));
  const totalBdt = Math.round(lines.reduce((sum, l) => sum + l.amountBdt, 0) * 100) / 100;

  const bid = await Bid.findOneAndUpdate(
    { tender: tender._id, contractor: req.auth!.sub },
    {
      tender: tender._id,
      contractor: req.auth!.sub,
      lines,
      totalBdt,
      timelineWeeks: parsed.data.timelineWeeks,
      validityDays: parsed.data.validityDays,
      coverLetter: parsed.data.coverLetter,
      status: BidStatus.SUBMITTED,
      submittedAt: new Date(),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate({ path: "contractor", select: "name username company ratingAvg ratingCount" });

  // The owner learns a bid arrived, but not what's in it — the count is all
  // they get until bidding closes.
  void notify(refId(tender.owner), {
    type: NotificationType.BID,
    title: "A bid arrived",
    body: `A contractor submitted a sealed bid on "${tender.title}".`,
    link: `/projects/${refId(tender.project)}`,
    actorId: req.auth!.sub,
  });

  return res.status(201).json({ data: { bid: toBidDto(bid) } });
}

/**
 * Decides whether the caller may read the bids on this tender at all.
 * Returns an error message, or null when reading is allowed.
 */
function assertReadable(
  tender: { status: TenderStatus; owner: unknown },
  auth: { sub: string; role: UserRole }
): string | null {
  const ownerId = refId(tender.owner);
  const isOwner = ownerId === auth.sub || auth.role === UserRole.ADMIN;
  if (!isOwner) return "Only the project owner can read the bids";
  if (tender.status === TenderStatus.OPEN) {
    return "Bids stay sealed until bidding closes";
  }
  if (tender.status === TenderStatus.DRAFT) return "This tender hasn't been published";
  return null;
}

/** Median of a list of numbers; undefined for an empty list. */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return Math.round(value * 100) / 100;
}

/**
 * GET /api/tenders/:id/bids — every bid, plus the line-by-line comparison.
 *
 * Refused outright while the tender is open; see `assertReadable`.
 */
export async function listTenderBids(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;

  const problem = assertReadable(tender, req.auth!);
  if (problem) return res.status(403).json({ error: { message: problem } });

  const bids = await Bid.find({ tender: tender._id, status: { $ne: BidStatus.WITHDRAWN } })
    .sort({ totalBdt: 1 })
    .populate({ path: "contractor", select: "name username company ratingAvg ratingCount" });

  // One row per BOQ line, carrying each bid's rate for it plus the median so
  // an outlier is obvious at a glance.
  const rows: BidComparisonRow[] = tender.items.map((item) => {
    const rates: Record<string, number> = {};
    for (const bid of bids) {
      const line = bid.lines.find((l) => l.itemId === item.id);
      if (line) rates[bid._id.toString()] = line.ratePerUnitBdt;
    }
    return {
      itemId: item.id,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      guideRateBdt: item.guideRateBdt,
      medianRateBdt: median(Object.values(rates)),
      rates,
    };
  });

  const totals: Record<string, number> = {};
  for (const bid of bids) totals[bid._id.toString()] = bid.totalBdt;

  const comparison: BidComparison = {
    rows,
    totals,
    lowestBidId: bids[0]?._id.toString(),
  };

  return res.json({ data: { bids: bids.map(toBidDto), comparison } });
}

/** GET /api/bids/mine — the contractor's own bids, newest first. */
export async function listMyBids(req: Request, res: Response) {
  const bids = await Bid.find({ contractor: req.auth!.sub })
    .sort({ createdAt: -1 })
    .populate({ path: "contractor", select: "name username company ratingAvg ratingCount" });

  // The tender each one is on, so the list reads as something other than ids.
  const tenders = await Tender.find({ _id: { $in: bids.map((b) => b.tender) } }).select(
    "title status deadlineAt"
  );
  const byId = new Map(tenders.map((t) => [t._id.toString(), t]));

  return res.json({
    data: {
      bids: bids.map((b) => {
        const tender = byId.get(b.tender.toString());
        return {
          ...toBidDto(b),
          tenderTitle: tender?.title ?? "",
          tenderStatus: tender?.status,
          tenderDeadlineAt: tender?.deadlineAt?.toISOString(),
        };
      }),
    },
  });
}

/** Loads a bid with its tender, or answers 404. */
async function findBidOr404(id: unknown, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Bid not found" } });
    return null;
  }
  const bid = await Bid.findById(id).populate({
    path: "contractor",
    select: "name username company ratingAvg ratingCount",
  });
  if (!bid) {
    res.status(404).json({ error: { message: "Bid not found" } });
    return null;
  }
  return bid;
}

/** POST /api/bids/:id/withdraw — pull a bid before the deadline. */
export async function withdrawBid(req: Request, res: Response) {
  const bid = await findBidOr404(req.params.id, res);
  if (!bid) return;
  if (refId(bid.contractor) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "That isn't your bid" } });
  }

  const tender = await Tender.findById(bid.tender);
  if (tender && tender.status !== TenderStatus.OPEN) {
    return res
      .status(409)
      .json({ error: { message: "Bidding has closed — this bid can't be withdrawn" } });
  }

  bid.status = BidStatus.WITHDRAWN;
  await bid.save();
  return res.json({ data: { bid: toBidDto(bid) } });
}

/** POST /api/bids/:id/shortlist — owner flags a serious candidate. */
export async function shortlistBid(req: Request, res: Response) {
  const bid = await findBidOr404(req.params.id, res);
  if (!bid) return;
  const tender = await Tender.findById(bid.tender);
  if (!tender) return res.status(404).json({ error: { message: "Tender not found" } });

  const problem = assertReadable(tender, req.auth!);
  if (problem) return res.status(403).json({ error: { message: problem } });

  bid.status = bid.status === BidStatus.SHORTLISTED ? BidStatus.SUBMITTED : BidStatus.SHORTLISTED;
  await bid.save();
  return res.json({ data: { bid: toBidDto(bid) } });
}

/**
 * POST /api/bids/:id/award — pick the winner.
 *
 * This is the moment construction becomes real: it creates the build contract,
 * lays out the milestone schedule from the default template, moves the project
 * to UNDER_CONSTRUCTION, and tells everyone who bid where they stand.
 */
export async function awardBid(req: Request, res: Response) {
  const bid = await findBidOr404(req.params.id, res);
  if (!bid) return;

  const tender = await Tender.findById(bid.tender);
  if (!tender) return res.status(404).json({ error: { message: "Tender not found" } });

  const problem = assertReadable(tender, req.auth!);
  if (problem) return res.status(403).json({ error: { message: problem } });
  if (tender.status === TenderStatus.AWARDED) {
    return res.status(409).json({ error: { message: "This tender has already been awarded" } });
  }
  if (bid.status === BidStatus.WITHDRAWN) {
    return res.status(409).json({ error: { message: "That bid was withdrawn" } });
  }

  const project = await Project.findById(tender.project);
  if (!project) return res.status(404).json({ error: { message: "Project not found" } });

  const contractorId = refId(bid.contractor);

  let contract;
  try {
    contract = await BuildContract.create({
      project: project._id,
      tender: tender._id,
      bid: bid._id,
      client: project.owner,
      contractor: contractorId,
      // The engineer who signed the structural drawings inspects the build.
      engineer: project.engineer,
      contractSumBdt: bid.totalBdt,
      timelineWeeks: bid.timelineWeeks,
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return res
        .status(409)
        .json({ error: { message: "This project already has a build contract" } });
    }
    throw err;
  }

  // Lay out the schedule. Percentages are frozen into BDT now so a later change
  // to the contract sum can't silently re-price a stage that's already funded.
  await Milestone.insertMany(
    DEFAULT_MILESTONE_TEMPLATE.map((stage, index) => ({
      buildContract: contract._id,
      project: project._id,
      order: index + 1,
      title: stage.title,
      description: stage.description,
      amountPct: stage.amountPct,
      amountBdt: Math.round((bid.totalBdt * stage.amountPct) / 100),
      status: MilestoneStatus.PENDING,
    }))
  );

  tender.status = TenderStatus.AWARDED;
  tender.awardedBid = bid._id;
  await tender.save();

  bid.status = BidStatus.AWARDED;
  await bid.save();

  // Everyone else who bid is rejected in the same breath — leaving them
  // "SUBMITTED" forever would be the platform ghosting them.
  await Bid.updateMany(
    { tender: tender._id, _id: { $ne: bid._id }, status: { $ne: BidStatus.WITHDRAWN } },
    { status: BidStatus.REJECTED }
  );

  project.status = ProjectStatus.UNDER_CONSTRUCTION;
  // Attach the winner to the project the same way `architect` and `engineer`
  // are attached. Without this the contractor can't read the project they just
  // won — including the one this very notification links them to.
  project.contractor = new Types.ObjectId(contractorId);
  await project.save();

  void notify(contractorId, {
    type: NotificationType.BID,
    title: "You won the tender",
    body: preview(`Your bid on "${tender.title}" was accepted. Construction can begin.`),
    link: `/projects/${project._id.toString()}`,
    actorId: req.auth!.sub,
  });

  const losers = await Bid.find({
    tender: tender._id,
    _id: { $ne: bid._id },
    status: BidStatus.REJECTED,
  }).select("contractor");
  for (const loser of losers) {
    void notify(String(loser.contractor), {
      type: NotificationType.BID,
      title: "Tender awarded to another bidder",
      body: `"${tender.title}" has been awarded. Thanks for bidding.`,
      link: "/tenders",
    });
  }

  return res.json({
    data: { bid: toBidDto(bid), buildContractId: contract._id.toString() },
  });
}

export { toBidDto };
