import type { Request, Response } from "express";
import {
  ESTIMATE_TIER_LABELS,
  EstimateTier,
  type CostEstimate,
  type EstimateSnapshot,
  type PriceResolution,
  type PriceSource,
  type PricingProvenance,
} from "@buildora/shared";
import { askAi, isAiConfigured } from "../services/ai";
import { screenNarrative } from "../services/aiGuard";
import { refreshEstimate } from "../services/estimateLadder";
import { compareMedians, currentCategoryMedians } from "../services/marketDrift";
import { refreshInBackgroundIfDue } from "../services/priceRefresh";
import { CostEstimateSnapshot, type PricingProvenanceDoc } from "../models/CostEstimateSnapshot";
import { findProjectOr404 } from "./projects.controller";

/**
 * The cost estimator.
 *
 * The figure is no longer something you press a button for — it is recalculated
 * and stored whenever the project gains real data (see services/estimateLadder),
 * so by the time an owner opens this there is already a history to read.
 *
 * This endpoint does two things: it makes sure the stored estimate is current,
 * and it fills in the written summary. The summary is produced **here and only
 * here**, lazily, because it is the one part that costs a model call — the
 * triggers that keep the figure fresh are pure arithmetic and must stay free.
 *
 * The split that matters everywhere on this platform holds here too: quantities
 * and money come from the BoqRate table or from real bids. The model is handed
 * finished numbers and asked to write about them. An owner budgeting a building
 * deserves better than figures that merely look right.
 */

function toSnapshotDto(doc: {
  _id: unknown;
  tier: EstimateTier;
  areaSqft: number;
  totalBdt: number;
  perSqftBdt: number;
  rangeLowBdt: number;
  rangeHighBdt: number;
  createdAt: Date;
}): EstimateSnapshot {
  return {
    id: String(doc._id),
    tier: doc.tier,
    areaSqft: doc.areaSqft,
    totalBdt: doc.totalBdt,
    perSqftBdt: doc.perSqftBdt,
    rangeLowBdt: doc.rangeLowBdt,
    rangeHighBdt: doc.rangeHighBdt,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * The stored provenance, as the browser sees it.
 *
 * Embeddings are conspicuously not here, and never should be: they are 384
 * floats per row that no human can read, they would dwarf the rest of the
 * payload, and the browser has nothing to do with them. The similarity *score*
 * goes over, because "matched at 0.71" is something a person can weigh.
 */
function toProvenanceDto(pricing: PricingProvenanceDoc): PricingProvenance {
  return {
    priceRunId: pricing.priceRun ? String(pricing.priceRun) : undefined,
    pricedAt: pricing.pricedAt?.toISOString(),
    prices: pricing.prices.map((p) => ({
      priceId: p.priceId,
      category: p.category,
      itemLabel: p.itemLabel,
      unit: p.unit,
      priceBdt: p.priceBdt,
      source: p.source as PriceSource,
      sourceName: p.sourceName,
      sourceUrl: p.sourceUrl,
      resolution: p.resolution as PriceResolution,
      similarity: p.similarity,
      ageDays: p.ageDays,
      effectiveFrom: p.effectiveFrom.toISOString(),
    })),
    linesRepriced: pricing.linesRepriced,
    linesWithFallback: pricing.linesWithFallback,
    originalTotalBdt: pricing.originalTotalBdt,
    labourBasis: pricing.labourBasis,
    // Derived here rather than stored, so the rule for "is this degraded?" lives
    // in one place and old snapshots answer it the same way new ones do.
    usedFallback:
      pricing.linesWithFallback > 0 ||
      pricing.prices.some((p) => p.resolution === "STALE_FALLBACK"),
  };
}

/** Asks the model to explain the figures. Returns undefined when it can't. */
async function narrate(estimate: CostEstimate): Promise<string | undefined> {
  if (!isAiConfigured()) return undefined;

  const table = estimate.lines
    .map(
      (l) =>
        `${l.description} (${l.category}): ${l.quantity} ${l.unit} @ ${l.ratePerUnitBdt} = ${l.totalBdt} BDT`
    )
    .join("\n");

  const driftLines = estimate.drift?.categories
    .filter((c) => c.changePct != null && Math.abs(c.changePct) >= 3)
    .map(
      (c) =>
        `${c.category}: median listing ${c.changePct! > 0 ? "up" : "down"} ${Math.abs(c.changePct!)}% since the last estimate, across ${c.listings} listings`
    )
    .join("\n");

  /*
   * The retrieved prices, handed over as grounding.
   *
   * This is the whole point of the RAG work: before, the model was told the
   * totals and asked to speculate about "what could push the figure up or down",
   * which is how you get plausible sentences about materials nobody priced. Now
   * it is given the actual rows the arithmetic used — the label, the figure, the
   * publisher and the age — and told to write about *those*.
   *
   * It still recalculates nothing. Retrieval grounds the prose; the numbers were
   * settled in services/repricing before this function was called.
   */
  const priceLines = estimate.pricing?.prices
    .slice(0, 8)
    .map(
      (p) =>
        `${p.itemLabel}: ${p.priceBdt} BDT per ${p.unit}, from ${p.sourceName}, ${p.ageDays} day(s) old${
          p.resolution === "STALE_FALLBACK" ? " — STALE, used as a fallback" : ""
        }`
    )
    .join("\n");

  const fallbackNote =
    estimate.pricing && estimate.pricing.linesWithFallback > 0
      ? `${estimate.pricing.linesWithFallback} of the line items could not be matched to a current price and fell back to the platform's stored rate.`
      : "";

  const prompt = `You are a quantity surveyor in Bangladesh writing a short note for a land owner.

These figures are already calculated and are NOT to be recalculated or corrected:
Building: ${estimate.floors}-storey ${estimate.buildingType.toLowerCase().replace(/_/g, " ")}, ${estimate.areaSqft} sqft total floor area.
This estimate is based on ${estimate.areaSource}.
${table}
TOTAL: ${estimate.totalBdt} BDT
Read it as a range: ${estimate.rangeLowBdt} to ${estimate.rangeHighBdt} BDT.
${priceLines ? `\nThese are the real material prices the figures above were adjusted to. They have ALREADY been applied:\n${priceLines}` : ""}
${fallbackNote ? `\n${fallbackNote}` : ""}
${driftLines ? `\nSeparately, median supplier listings have moved:\n${driftLines}` : ""}

Write three short paragraphs, plain English, no markdown and no headings:
1. What this estimate covers, roughly what it works out to per square foot, and — importantly — why it is a range rather than one number, given what it was based on.
2. The two or three line items that dominate the cost, and why.
${
  priceLines
    ? `3. Which of the material prices listed above are doing the most to move this estimate, naming the source and how old the price is. ${
        fallbackNote
          ? "Say plainly that some items had no current price and fell back to a stored rate, so those parts of the estimate are less current than the rest."
          : ""
      }`
    : driftLines
      ? "3. What the supplier price movement above suggests, and be explicit that it has NOT been applied to the figures — material listing prices and composite work rates are different things."
      : "3. What could push the real figure up or down: soil conditions, finish quality, material price movement. Be specific to Bangladesh."
}

Do not invent numbers that are not above. Do not give advice about hiring. Never use the words "quote", "final" or "guaranteed" — this is an estimate, not an offer.`;

  try {
    const answer = await askAi({ messages: [{ role: "user", content: prompt }], maxTokens: 500 });
    return screenNarrative(answer.text) ?? undefined;
  } catch (err) {
    // A missing narrative is a much smaller loss than a failed estimate, so
    // this never propagates.
    console.error("[estimator] narrative unavailable:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * POST /api/projects/:id/estimate — the current estimate, with its written
 * summary and the history behind it.
 */
export async function estimateProject(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  // The lazy refresh trigger. Render's free tier spins this instance down when
  // idle, so an in-process weekly timer cannot be relied on — reading an
  // estimate is the one moment we know the process is awake. It returns
  // immediately and refreshes in the background; this request is never made to
  // wait for a scrape. See services/priceRefresh for the other two triggers.
  refreshInBackgroundIfDue();

  // Make sure the stored figure reflects whatever the project looks like now.
  const result = await refreshEstimate(project);
  if (!result) {
    return res.status(503).json({
      error: { message: "No BOQ rates are configured yet, run the build seed first" },
    });
  }

  const { snapshot } = result;

  // Market movement is measured against the medians stored on the *previous*
  // snapshot, so the window is always "since your last estimate".
  const previous = await CostEstimateSnapshot.findOne({
    project: project._id,
    _id: { $ne: snapshot._id },
  }).sort({ createdAt: -1 });

  const estimate: CostEstimate = {
    areaSqft: snapshot.areaSqft,
    floors: snapshot.floors,
    buildingType: snapshot.buildingType,
    lines: snapshot.lines,
    byCategory: snapshot.byCategory,
    totalBdt: snapshot.totalBdt,
    perSqftBdt: snapshot.perSqftBdt,
    ratesFrom: snapshot.ratesFrom,
    estimatedAt: snapshot.createdAt.toISOString(),
    tier: snapshot.tier,
    areaSource: snapshot.areaSource,
    rangeLowBdt: snapshot.rangeLowBdt,
    rangeHighBdt: snapshot.rangeHighBdt,
    drift: compareMedians(
      await currentCategoryMedians(),
      previous?.categoryMedians,
      previous ? previous.createdAt.toISOString() : null
    ),
    ...(snapshot.pricing ? { pricing: toProvenanceDto(snapshot.pricing) } : {}),
  };

  // The narrative is written once per snapshot and cached on it. Re-opening the
  // page costs nothing; only a genuinely new estimate spends a model call.
  if (snapshot.narrative) {
    estimate.narrative = snapshot.narrative;
  } else {
    const written = await narrate(estimate);
    if (written) {
      estimate.narrative = written;
      snapshot.narrative = written;
      await snapshot.save();
    }
  }

  const history = await CostEstimateSnapshot.find({ project: project._id })
    .sort({ createdAt: -1 })
    .limit(8);

  return res.json({
    data: {
      estimate,
      tierLabel: ESTIMATE_TIER_LABELS[snapshot.tier],
      history: history.map(toSnapshotDto),
    },
  });
}
