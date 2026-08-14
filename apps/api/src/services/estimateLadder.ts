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
import type { ProjectDoc } from "../models/Project";
import { currentCategoryMedians } from "./marketDrift";

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
 * Works out the best tier this project currently supports, and the priced lines
 * for it. Each rung is tried from the most trustworthy downwards.
 */
async function resolveTier(project: HydratedDocument<ProjectDoc>): Promise<{
  tier: EstimateTier;
  areaSqft: number;
  areaSource: string;
  lines: CostLine[];
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
      };
    }
  }

  // Rung 2: measured off the plans the architect actually drew. floorAreaSqft
  // is the same function the FAR check uses, so the estimate and the permit
  // tools can never disagree about how big the building is.
  if (drawnSqft > 0) {
    return {
      tier: EstimateTier.FLOOR_PLAN,
      areaSqft: drawnSqft,
      areaSource: "your drawn floor plans",
      lines: await priceArea(drawnSqft),
    };
  }

  // Rung 1: nothing but the brief.
  const areaSqft = estimateAreaFromPlot(project);
  return {
    tier: EstimateTier.PLOT_ONLY,
    areaSqft,
    areaSource: "your plot size and floor count, before anything is drawn",
    lines: await priceArea(areaSqft),
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
    const { tier, areaSqft, areaSource, lines } = await resolveTier(project);
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
    });

    return { snapshot, isNew: true };
  } catch (err) {
    console.error("[estimate] refresh failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
