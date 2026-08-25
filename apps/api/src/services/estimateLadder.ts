import type { HydratedDocument } from "mongoose";
import {
  ESTIMATE_CONFIDENCE,
  EstimateTier,
  KATHA_TO_SQFT,
  floorAreaSqft,
  type CostLine,
} from "@buildora/shared";
import { CostEstimateSnapshot, type CostEstimateSnapshotDoc } from "../models/CostEstimateSnapshot";
import { FloorPlan } from "../models/FloorPlan";
import { Tender } from "../models/Tender";
import { Bid } from "../models/Bid";
import { BoqRate } from "../models/BoqRate";
import { Project, type ProjectDoc } from "../models/Project";
import { currentCategoryMedians } from "./marketDrift";
import { lastSuccessfulRun } from "./priceRefresh";
import { loadRepricingContext, repriceLines, type RepricingSummary } from "./repricing";

/**
 * The estimate that keeps up with the project.
 *
 * An owner gets a costed figure the moment they post a brief, and it sharpens
 * every time something real lands — the architect draws the floors, a Bill of
 * Quantities is published, contractors bid. Each recalculation is stored, so
 * "it updates as you go" is something the owner can see rather than something
 * they have to believe.
 *
 * Two things make it safe to run this automatically on every trigger:
 *
 *   1. **No model is involved.** It's a rate-table read and a multiplication.
 *      The written summary is produced separately, and only when someone opens
 *      the estimate.
 *   2. **Snapshots are deduplicated.** Floor plans get saved constantly; a new
 *      row is only written when the tier changed or the area moved enough to
 *      matter.
 */

/** Below this, a re-save didn't really change the building. */
const AREA_CHANGE_THRESHOLD = 0.02;

/** A typical build covers about 60% of the plot on each floor. */
const TYPICAL_PLOT_COVERAGE = 0.6;

export interface LadderResult {
  snapshot: HydratedDocument<CostEstimateSnapshotDoc>;
  /** False when an existing snapshot was reused rather than a new one written. */
  isNew: boolean;
}

/** Prices a floor area from the rate table — the estimator's own arithmetic. */
async function priceArea(areaSqft: number): Promise<CostLine[]> {
  const rates = await BoqRate.find({ active: true }).sort({ order: 1, category: 1 });
  return rates.map((rate) => {
    const quantity = Math.round(rate.quantityPerSqft * areaSqft * 100) / 100;
    return {
      description: rate.description,
      category: rate.category,
      unit: rate.unit,
      quantity,
      ratePerUnitBdt: rate.ratePerUnitBdt,
      totalBdt: Math.round(quantity * rate.ratePerUnitBdt),
    };
  });
}

/**
 * Moves rate-table lines to today's material prices.
 *
 * Only the two lower rungs go through here, and the reason is worth stating: a
 * BOQ tier is priced from quantities and guide rates the owner published, and a
 * bid-backed tier is priced from what contractors actually offered. Both are
 * already *real prices for this building*. Adjusting them by a market index
 * would be second-guessing a firm number with a general one — repricing exists
 * to sharpen a guess, not to overrule a quote.
 *
 * Never throws: a pricing layer that isn't seeded yet leaves the lines exactly
 * as they were, which is precisely how this behaved before phase 3.
 */
async function applyLivePrices(
  lines: CostLine[]
): Promise<{ lines: CostLine[]; summary: RepricingSummary | null }> {
  try {
    const context = await loadRepricingContext();
    if (context.compositions.size === 0) return { lines, summary: null };

    const result = repriceLines(lines, context);
    return { lines: result.lines, summary: result.summary };
  } catch (err) {
    console.error("[estimate] repricing skipped:", err instanceof Error ? err.message : err);
    return { lines, summary: null };
  }
}

/**
 * Works out the best tier this project currently supports, and the priced lines
 * for it. Each rung is tried from the most trustworthy downwards.
 */
async function resolveTier(project: HydratedDocument<ProjectDoc>): Promise<{
  tier: EstimateTier;
  areaSqft: number;
  areaSource: string;
  lines: CostLine[];
  /** Set only on the rungs that are repriced from live data — see applyLivePrices. */
  pricing: RepricingSummary | null;
}> {
  // Floor area is still wanted for the per-sqft figure even on the top rungs.
  const plans = await FloorPlan.find({ project: project._id });
  const drawnSqft = Math.round(plans.reduce((sum, p) => sum + floorAreaSqft(p.rooms), 0));

  const tender = await Tender.findOne({ project: project._id });

  // Rung 4: what contractors actually bid. Nothing beats a real price.
  if (tender) {
    const bids = await Bid.find({ tender: tender._id });
    if (bids.length > 0) {
      // The median bid, so one outlier doesn't set the owner's expectation.
      const totals = bids.map((b) => b.totalBdt).sort((a, b) => a - b);
      const mid = Math.floor(totals.length / 2);
      const medianTotal =
        totals.length % 2 === 0 ? (totals[mid - 1]! + totals[mid]!) / 2 : totals[mid]!;

      // Priced per BOQ line from the median rate across bids for that line.
      const lines: CostLine[] = tender.items.map((item) => {
        const rates = bids
          .flatMap((b) => b.lines.filter((l) => l.itemId === item.id))
          .map((l) => l.ratePerUnitBdt)
          .sort((a, b) => a - b);
        const m = Math.floor(rates.length / 2);
        const rate = rates.length
          ? rates.length % 2 === 0
            ? (rates[m - 1]! + rates[m]!) / 2
            : rates[m]!
          : 0;
        return {
          description: item.description,
          category: "Tendered work",
          unit: item.unit,
          quantity: item.quantity,
          ratePerUnitBdt: Math.round(rate),
          totalBdt: Math.round(rate * item.quantity),
        };
      });

      // Fall back to the median total if the per-line rates didn't add up (a
      // bid that skipped lines, say) — the total is the number that was bid.
      const summed = lines.reduce((s, l) => s + l.totalBdt, 0);
      if (summed <= 0 && medianTotal > 0) {
        lines.push({
          description: "Contractor bid (median of submitted bids)",
          category: "Tendered work",
          unit: "job",
          quantity: 1,
          ratePerUnitBdt: Math.round(medianTotal),
          totalBdt: Math.round(medianTotal),
        });
      }

      return {
        tier: EstimateTier.BID_BACKED,
        areaSqft: drawnSqft || estimateAreaFromPlot(project),
        areaSource: `the median of ${bids.length} contractor bid${bids.length === 1 ? "" : "s"}`,
        lines,
        // Real bids for this building beat any market index — see applyLivePrices.
        pricing: null,
      };
    }

    // Rung 3: a published BOQ has real quantities, not area-derived guesses.
    if (tender.items.length > 0) {
      const lines: CostLine[] = tender.items.map((item) => ({
        description: item.description,
        category: "Tendered work",
        unit: item.unit,
        quantity: item.quantity,
        ratePerUnitBdt: item.guideRateBdt ?? 0,
        totalBdt: Math.round((item.guideRateBdt ?? 0) * item.quantity),
      }));
      return {
        tier: EstimateTier.BOQ,
        areaSqft: drawnSqft || estimateAreaFromPlot(project),
        areaSource: "the quantities in your published Bill of Quantities",
        lines,
        pricing: null,
      };
    }
  }

  // Rung 2: measured off the plans the architect actually drew. floorAreaSqft
  // is the same function the FAR check uses, so the estimate and the permit
  // tools can never disagree about how big the building is.
  if (drawnSqft > 0) {
    const priced = await applyLivePrices(await priceArea(drawnSqft));
    return {
      tier: EstimateTier.FLOOR_PLAN,
      areaSqft: drawnSqft,
      areaSource: "your drawn floor plans",
      lines: priced.lines,
      pricing: priced.summary,
    };
  }

  // Rung 1: nothing but the brief.
  const areaSqft = estimateAreaFromPlot(project);
  const priced = await applyLivePrices(await priceArea(areaSqft));
  return {
    tier: EstimateTier.PLOT_ONLY,
    areaSqft,
    areaSource: "your plot size and floor count, before anything is drawn",
    lines: priced.lines,
    pricing: priced.summary,
  };
}

/**
 * Turns a repricing summary into the block stored on the snapshot.
 *
 * The refresh run is looked up here so the snapshot names the *version* of the
 * price data it used, not merely the day it ran. That pointer is what makes an
 * old estimate reproducible: the run says what was gathered and from where, and
 * the append-only price rows it wrote are all still there.
 */
async function toProvenance(summary: RepricingSummary) {
  const run = await lastSuccessfulRun();

  return {
    priceRun: run?._id,
    pricedAt: run?.finishedAt,
    prices: summary.pricesUsed.map((p) => ({
      priceId: p.priceId,
      category: p.category,
      itemLabel: p.itemLabel,
      unit: p.unit,
      priceBdt: p.priceBdt,
      source: p.source,
      sourceName: p.sourceName,
      sourceUrl: p.sourceUrl,
      resolution: p.resolution,
      similarity: p.similarity,
      // Frozen at calculation time — "14 days old when this was worked out",
      // not "14 days old whenever you happen to read this".
      ageDays: p.ageDays,
      effectiveFrom: p.effectiveFrom,
    })),
    linesRepriced: summary.linesRepriced,
    linesWithFallback: summary.linesWithFallback,
    originalTotalBdt: summary.originalTotalBdt,
    labourBasis: summary.labourBasis,
  };
}

/** The rough footprint of a plot before anybody has drawn on it. */
function estimateAreaFromPlot(project: HydratedDocument<ProjectDoc>): number {
  return Math.round(project.landAreaKatha * KATHA_TO_SQFT * TYPICAL_PLOT_COVERAGE * project.floors);
}

/**
 * Recalculates the estimate and stores it, unless the last one already says the
 * same thing.
 *
 * Never throws. It runs inside handlers whose real job is posting a brief or
 * saving a floor plan, and none of those should fail because the estimator had
 * a bad day.
 */
export async function refreshEstimate(
  project: HydratedDocument<ProjectDoc>
): Promise<LadderResult | null> {
  try {
    const { tier, areaSqft, areaSource, lines, pricing } = await resolveTier(project);
    if (lines.length === 0) return null;

    const totalBdt = lines.reduce((sum, l) => sum + l.totalBdt, 0);
    if (totalBdt <= 0) return null;

    const previous = await CostEstimateSnapshot.findOne({ project: project._id }).sort({
      createdAt: -1,
    });

    // Floor plans save often. Only write a new row when the picture actually
    // changed — otherwise the history becomes noise and stops being readable.
    if (previous && previous.tier === tier) {
      const moved =
        previous.areaSqft > 0 ? Math.abs(areaSqft - previous.areaSqft) / previous.areaSqft : 1;
      if (moved < AREA_CHANGE_THRESHOLD && previous.totalBdt === totalBdt) {
        return { snapshot: previous, isNew: false };
      }
    }

    const byCategory = new Map<string, number>();
    for (const line of lines) {
      byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.totalBdt);
    }

    const band = ESTIMATE_CONFIDENCE[tier];
    const snapshot = await CostEstimateSnapshot.create({
      project: project._id,
      tier,
      areaSqft,
      areaSource,
      floors: project.floors,
      buildingType: project.buildingType,
      lines,
      byCategory: [...byCategory.entries()].map(([category, total]) => ({
        category,
        totalBdt: total,
      })),
      totalBdt,
      perSqftBdt: areaSqft > 0 ? Math.round(totalBdt / areaSqft) : 0,
      rangeLowBdt: Math.round(totalBdt * (1 - band)),
      rangeHighBdt: Math.round(totalBdt * (1 + band)),
      // Today's marketplace medians, stored so the *next* estimate has a
      // baseline to measure movement against.
      categoryMedians: await currentCategoryMedians(),
      ratesFrom: lines.length,
      // Phase 4: which prices produced this figure, frozen at the moment it was
      // calculated. Copied rather than referenced so this stays readable even if
      // a price row is later corrected — see PricingProvenanceDoc.
      ...(pricing ? { pricing: await toProvenance(pricing) } : {}),
    });

    return { snapshot, isNew: true };
  } catch (err) {
    console.error("[estimate] refresh failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Re-runs the ladder for every project in the platform — every land owner's
 * estimate, checked against whatever prices are current right now.
 *
 * This is deliberately not something the lazy or cron triggers do. Those exist
 * to keep the *price data* fresh without anyone noticing; walking every
 * project's estimate is real work (a handful of Mongo round trips each) that
 * is only worth paying for when someone has actually asked for it — the admin
 * pressing "Refresh prices now". `refreshEstimate` already does the useful
 * thing here for free: a project whose tier is BOQ or BID_BACKED, or whose
 * repriced total didn't move, is left exactly as it was — see the dedupe note
 * on refreshEstimate. So this is safe to run on everything without it turning
 * every project's history into noise.
 */
export async function recalculateAllEstimates(): Promise<{ checked: number; updated: number }> {
  const projects = await Project.find();

  let updated = 0;
  for (const project of projects) {
    const result = await refreshEstimate(project);
    if (result?.isNew) updated += 1;
  }

  return { checked: projects.length, updated };
}
