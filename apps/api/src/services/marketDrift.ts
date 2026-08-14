import { ProductCategory, type CategoryDrift, type MarketDrift } from "@buildora/shared";
import { Product } from "../models/Product";
import type { CategoryMedianDoc } from "../models/CostEstimateSnapshot";

/**
 * What building materials are actually listing for, right now, on Buildora.
 *
 * The rate table an estimate is priced from is admin-maintained, which means it
 * is only as fresh as the last time somebody edited it. Meanwhile real
 * suppliers are posting real prices on the marketplace every week. This reads
 * those, per category, and reports how they've moved since the owner's previous
 * estimate.
 *
 * **It reports. It does not reprice, and that limit is the important part.**
 * A marketplace listing is a per-unit *material* price — one bag of cement. A
 * BoqRate line is composite: "RCC works (1:1.5:3) including shuttering" bundles
 * material, labour and formwork. There is no honest arithmetic that turns the
 * first into a correction for the second, and code that pretends otherwise
 * would produce a number that looks authoritative and means nothing. So the
 * estimate total stays rate-table-derived, and this sits beside it as a signal
 * for a person to weigh.
 */

/** Below this, a "median" is one supplier's opinion — or their typo. */
const MIN_LISTINGS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Current median listing price for every category with enough listings to mean
 * anything. Stored on each snapshot so the next one has a baseline to compare
 * against — which is why this returns the storage shape.
 */
export async function currentCategoryMedians(): Promise<CategoryMedianDoc[]> {
  const rows = await Product.aggregate<{ _id: string; prices: number[] }>([
    { $match: { isActive: true } },
    { $group: { _id: "$category", prices: { $push: "$priceBdt" } } },
  ]);

  return rows
    .filter((r) => r.prices.length >= MIN_LISTINGS)
    .map((r) => ({
      category: r._id,
      medianBdt: Math.round(median(r.prices) * 100) / 100,
      listings: r.prices.length,
    }));
}

/**
 * Compares today's medians against those stored on the previous snapshot.
 *
 * With no previous snapshot every `changePct` is null, which the UI shows as
 * "no earlier estimate to compare against" rather than as no movement.
 */
export function compareMedians(
  current: CategoryMedianDoc[],
  previous: CategoryMedianDoc[] | undefined,
  comparedTo: string | null
): MarketDrift {
  const before = new Map((previous ?? []).map((p) => [p.category, p]));

  const categories: CategoryDrift[] = current.map((c) => {
    const prev = before.get(c.category);
    return {
      category: c.category,
      medianBdt: c.medianBdt,
      previousMedianBdt: prev?.medianBdt ?? null,
      changePct:
        prev && prev.medianBdt > 0
          ? Math.round(((c.medianBdt - prev.medianBdt) / prev.medianBdt) * 1000) / 10
          : null,
      listings: c.listings,
    };
  });

  // Categories that exist on the platform but are too thinly listed to read.
  const covered = new Set(current.map((c) => c.category));
  const thinCategories = Object.values(ProductCategory).filter((c) => !covered.has(c));

  return {
    // Biggest movers first — that's what a person actually wants to see.
    categories: categories.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)),
    thinCategories,
    comparedTo,
  };
}
