import {
  PRICE_STALE_AFTER_DAYS,
  PriceSource,
  ProductCategory,
  type CostComponent,
} from "@buildora/shared";
import { MarketPrice, type MarketPriceDoc } from "../models/MarketPrice";
import { cosineSimilarity } from "./embeddings";

/**
 * Finding the right price for one slice of a rate.
 *
 * ## Why embeddings and not just a category lookup
 *
 * A category match gets you to "cement" and no further. But the rate table asks
 * three different questions of that category — cement for structural RCC, cement
 * for mortar, cement for tile grout — and the marketplace answers with a dozen
 * differently-worded listings. Picking the first CEMENT row would let a bag of
 * white decorative cement price a concrete frame.
 *
 * So retrieval works in two steps: the category narrows the field to candidates
 * that could possibly be right, and cosine similarity between the component's
 * query vector and each candidate's label vector picks the best of them. The
 * component "cement for mortar" lands on a mortar-appropriate listing; "cement"
 * on the RCC line lands on structural OPC.
 *
 * ## Why this is cheap enough to do per request
 *
 * Both vectors were computed offline by the weekly job — see services/embeddings
 * for why that rule exists. What happens here is a dot product over 384 floats
 * per candidate, across maybe a dozen candidates. It is arithmetic on numbers
 * already in memory, and it costs nothing worth measuring.
 *
 * ## The fallback ladder, and saying so out loud
 *
 * Live data goes missing. Suppliers stop listing, a scraper breaks, a category
 * was never covered. Every result therefore carries how it was reached, and a
 * result reached by falling back says so all the way up to the owner's screen —
 * an estimate that quietly substitutes a stale figure for a live one is worse
 * than one that admits it could not find a live one.
 */

/** How a price was arrived at. Ordered best to worst; the UI shows the worst. */
export type PriceResolution =
  /** A live price whose label the embedding matched to this component. */
  | "SEMANTIC"
  /** A live price in the right category, but no vectors to rank with. */
  | "CATEGORY"
  /** Nothing current — the newest curated price, however old. */
  | "STALE_FALLBACK"
  /** No price at all. The rate's own seeded figure stands unadjusted. */
  | "NONE";

export interface RetrievedPrice {
  category: ProductCategory;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: PriceSource;
  sourceName: string;
  sourceUrl?: string;
  effectiveFrom: Date;
  /** Days since it took effect — what the staleness rule is applied to. */
  ageDays: number;
  resolution: PriceResolution;
  /** Cosine score when resolution is SEMANTIC, for explaining the match. */
  similarity?: number;
  /** The MarketPrice row's id, recorded on the estimate for audit (phase 4). */
  priceId: string;
}

/**
 * Below this the match is worse than not matching.
 *
 * **This number is measured, not guessed** — `pnpm check:embeddings` prints the
 * scores it came from. Asking for the cement slice of the RCC rate against a
 * realistic candidate set gives:
 *
 *     0.432  OPC cement, 50kg bag      ← correct
 *     0.423  PCC cement, 50kg bag      ← also cement
 *     0.282  Plastic paint, interior   ← wrong
 *     0.182  MS deformed bar, 60 grade ← wrong
 *
 * The absolute scores are lower than they look like they should be, because
 * every phrase in this domain shares vocabulary and MiniLM is comparing short
 * fragments. What matters is the *gap*, and there is a clear one between 0.423
 * and 0.282.
 *
 * An earlier value of 0.45 was set by intuition and was badly wrong: it sat
 * above every genuine match in that run, so correct matches would have been
 * thrown away wholesale. 0.35 sits in the gap.
 *
 * Note this only ever guards *within* a category — the candidate list is
 * filtered by category first — so its real job is rejecting "nothing in here
 * suits" rather than telling cement from steel.
 */
const MIN_SIMILARITY = 0.35;

function ageInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function toRetrieved(
  doc: MarketPriceDoc & { _id: unknown },
  resolution: PriceResolution,
  similarity?: number
): RetrievedPrice {
  return {
    category: doc.category,
    itemLabel: doc.itemLabel,
    unit: doc.unit,
    priceBdt: doc.priceBdt,
    source: doc.source,
    sourceName: doc.sourceName,
    sourceUrl: doc.sourceUrl,
    effectiveFrom: doc.effectiveFrom,
    ageDays: ageInDays(doc.effectiveFrom),
    resolution,
    similarity,
    priceId: String(doc._id),
  };
}

/**
 * Every approved price, newest first, grouped by category.
 *
 * Loaded once per estimate rather than queried per component: a build has
 * fifteen rate lines with thirty-odd material slices between them, and thirty
 * round trips to fetch from the same small collection would be silly. The
 * collection is append-only, so this also has to keep only the newest row per
 * distinct label — older rows are history, not candidates.
 */
export async function loadPriceCandidates(): Promise<Map<ProductCategory, MarketPriceDoc[]>> {
  const rows = await MarketPrice.find({ approved: true }).sort({ effectiveFrom: -1 }).limit(500);

  const byCategory = new Map<ProductCategory, MarketPriceDoc[]>();
  const seen = new Set<string>();

  for (const row of rows) {
    // First time a label is seen is its newest row, because of the sort.
    const key = `${row.category}::${row.itemLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  return byCategory;
}

/**
 * Picks the best price for one rate component.
 *
 * Walks the ladder: semantic match among fresh candidates, then any fresh
 * candidate in the category, then the newest stale one, then nothing.
 */
export function retrievePriceFor(
  component: CostComponent,
  candidates: Map<ProductCategory, MarketPriceDoc[]>
): RetrievedPrice | null {
  if (!component.category) return null;

  const all = candidates.get(component.category);
  if (!all || all.length === 0) return null;

  const fresh = all.filter((c) => ageInDays(c.effectiveFrom) <= PRICE_STALE_AFTER_DAYS);

  // ---- Rung 1: semantic match among fresh prices ----
  if (component.embedding && fresh.length > 0) {
    let best: MarketPriceDoc | null = null;
    let bestScore = -1;

    for (const candidate of fresh) {
      if (!candidate.embedding) continue;
      const score = cosineSimilarity(component.embedding, candidate.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best && bestScore >= MIN_SIMILARITY) {
      return toRetrieved(
        best as MarketPriceDoc & { _id: unknown },
        "SEMANTIC",
        Math.round(bestScore * 1000) / 1000
      );
    }
  }

  // ---- Rung 2: right category, no usable ranking ----
  // Prefers a marketplace median over a curated row: both are fresh, and the
  // marketplace one is what suppliers are charging this week.
  if (fresh.length > 0) {
    const preferred = fresh.find((c) => c.source === PriceSource.MARKETPLACE) ?? fresh[0]!;
    return toRetrieved(preferred as MarketPriceDoc & { _id: unknown }, "CATEGORY");
  }

  // ---- Rung 3: everything is stale, take the newest anyway and flag it ----
  return toRetrieved(all[0] as MarketPriceDoc & { _id: unknown }, "STALE_FALLBACK");
}
