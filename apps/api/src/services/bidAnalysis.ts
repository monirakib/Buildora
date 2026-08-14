import { BID_OUTLIER_PCT, type BidOutlierBand } from "@buildora/shared";
import { BoqRate, type BoqRateDoc } from "../models/BoqRate";

/**
 * Comparing bid rates against what the platform reckons work costs.
 *
 * Shared by the two sides of the tender, which need very different amounts of
 * detail:
 *
 *   - The **contractor** sanity check tells them a direction and a band and no
 *     absolute figure, because the benchmark is derived from the same table the
 *     owner's guide rates come from. Handing a bidder "you're 45% over" lets
 *     them divide their way back to the owner's number, which is exactly what
 *     the sealed-bid design exists to prevent.
 *   - The **owner** analysis gets everything, including their own guide rates,
 *     because those are theirs.
 *
 * All the arithmetic lives here. A model is never asked to compare two numbers.
 */

/** How a rate compares to its benchmark, as a signed percentage. */
export function percentDiff(rate: number, benchmark: number): number {
  if (benchmark <= 0) return 0;
  return ((rate - benchmark) / benchmark) * 100;
}

/** Turns a percentage gap into the coarse band a contractor is told. */
export function bandFor(absPct: number): BidOutlierBand {
  if (absPct >= 100) return "100%+";
  if (absPct >= 50) return "50-100%";
  return "25-50%";
}

/**
 * Matches a BOQ line to a rate-table row by description.
 *
 * The BOQ is normally generated from this very table (see getBoqTemplate), so
 * most lines match exactly. An owner who edited a description or added a line of
 * their own simply doesn't match, and an unmatched line is reported as such
 * rather than benchmarked against something approximate.
 */
export function matchRate(description: string, rates: BoqRateDoc[]): BoqRateDoc | undefined {
  const needle = description.trim().toLowerCase();
  const exact = rates.find((r) => r.description.trim().toLowerCase() === needle);
  if (exact) return exact;
  // One fallback: a rate whose description is contained in the line, or the
  // reverse. Anything looser would start matching "sand filling" to "sand".
  return rates.find((r) => {
    const hay = r.description.trim().toLowerCase();
    return hay.length > 8 && (needle.includes(hay) || hay.includes(needle));
  });
}

/** The active rate table, in build order — the same read the estimator does. */
export async function loadRates(): Promise<BoqRateDoc[]> {
  return BoqRate.find({ active: true }).sort({ order: 1, category: 1 });
}

/** True when a gap is big enough to be worth raising at all. */
export function isOutlier(pct: number): boolean {
  return Math.abs(pct) >= BID_OUTLIER_PCT;
}
