import { describe, expect, it } from "vitest";
import {
  CostComponentKind,
  PriceSource,
  ProductCategory,
  type CostComponent,
} from "@buildora/shared";
import { retrievePriceFor } from "./priceRetrieval";
import type { MarketPriceDoc } from "../models/MarketPrice";

/**
 * The retrieval ladder, and the number at the top of it.
 *
 * MIN_SIMILARITY is 0.35, and it is *measured* — an earlier value of 0.45 was
 * picked by intuition and sat above every genuine match in the run it was
 * tested against, so it would have thrown away correct answers wholesale. A
 * threshold that drifts back up breaks nothing visibly: retrieval just quietly
 * stops matching and every estimate falls back to its seeded figure.
 *
 * The embeddings here are unit vectors chosen so cosine similarity is exactly
 * their first component — no model, no network, and the score under test is
 * readable straight off the page.
 */

/** A unit vector whose cosine similarity with QUERY is exactly `score`. */
function vectorScoring(score: number): number[] {
  return [score, Math.sqrt(1 - score * score)];
}

const QUERY = [1, 0];

function priceDoc(over: Partial<MarketPriceDoc> & { id?: string } = {}): MarketPriceDoc {
  const { id, ...rest } = over;
  return {
    _id: id ?? "price-1",
    category: ProductCategory.CEMENT,
    itemLabel: "OPC cement, 50kg bag",
    unit: "bag",
    priceBdt: 540,
    source: PriceSource.CURATED,
    sourceName: "test",
    approved: true,
    effectiveFrom: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  } as unknown as MarketPriceDoc;
}

/** `loadPriceCandidates` returns newest-first per category; mirror that here. */
function candidates(...docs: MarketPriceDoc[]) {
  return new Map([[ProductCategory.CEMENT, docs]]);
}

function component(over: Partial<CostComponent> = {}): CostComponent {
  return {
    kind: CostComponentKind.MATERIAL,
    category: ProductCategory.CEMENT,
    label: "cement",
    fraction: 1,
    embedding: QUERY,
    ...over,
  };
}

/** A date `n` days ago, for the 21-day staleness rule. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

describe("retrievePriceFor — rung 1, the semantic match", () => {
  it("takes the best-scoring candidate above the threshold", () => {
    const result = retrievePriceFor(
      component(),
      candidates(
        priceDoc({ id: "wrong", itemLabel: "Plastic paint", embedding: vectorScoring(0.28) }),
        priceDoc({ id: "right", itemLabel: "OPC cement", embedding: vectorScoring(0.43) })
      )
    );

    expect(result?.priceId).toBe("right");
    expect(result?.resolution).toBe("SEMANTIC");
    expect(result?.similarity).toBeCloseTo(0.43, 2);
  });

  it("accepts a score of 0.43 — a real cement match from the measured run", () => {
    // These are the actual numbers `pnpm check:embeddings` produced: 0.432 for
    // the correct row, 0.282 for paint. A threshold above 0.43 rejects both.
    const result = retrievePriceFor(
      component(),
      candidates(priceDoc({ embedding: vectorScoring(0.432) }))
    );
    expect(result?.resolution).toBe("SEMANTIC");
  });

  it("falls through when nothing clears the threshold", () => {
    const result = retrievePriceFor(
      component(),
      candidates(priceDoc({ id: "paint", embedding: vectorScoring(0.28) }))
    );
    // Still returns the row, but as a category match rather than claiming the
    // embedding matched it.
    expect(result?.resolution).toBe("CATEGORY");
    expect(result?.similarity).toBeUndefined();
  });

  it("holds at exactly 0.35 — the boundary is inclusive", () => {
    const result = retrievePriceFor(
      component(),
      candidates(priceDoc({ embedding: vectorScoring(0.35) }))
    );
    expect(result?.resolution).toBe("SEMANTIC");
  });

  it("ignores candidates that have never been embedded", () => {
    const result = retrievePriceFor(
      component(),
      candidates(priceDoc({ id: "unembedded", embedding: undefined }))
    );
    expect(result?.resolution).toBe("CATEGORY");
  });
});

describe("retrievePriceFor — rung 2, the category fallback", () => {
  it("prefers what suppliers are charging over a curated row", () => {
    const result = retrievePriceFor(
      component({ embedding: undefined }),
      candidates(
        priceDoc({ id: "curated", source: PriceSource.CURATED }),
        priceDoc({ id: "market", source: PriceSource.MARKETPLACE })
      )
    );
    // Both are fresh, so the live marketplace median wins.
    expect(result?.priceId).toBe("market");
    expect(result?.resolution).toBe("CATEGORY");
  });

  it("takes the newest row when there is no marketplace price", () => {
    const result = retrievePriceFor(
      component({ embedding: undefined }),
      candidates(priceDoc({ id: "newest" }), priceDoc({ id: "older", effectiveFrom: daysAgo(5) }))
    );
    expect(result?.priceId).toBe("newest");
  });
});

describe("retrievePriceFor — rung 3, everything is stale", () => {
  it("returns the newest stale price, flagged as a fallback", () => {
    const result = retrievePriceFor(
      component(),
      // Past the 21-day staleness line, so no rung above this one applies.
      candidates(priceDoc({ id: "old", effectiveFrom: daysAgo(40), embedding: vectorScoring(0.9) }))
    );

    // Flagged rather than silently used: repriceLine reads STALE_FALLBACK to
    // tell the owner part of their estimate is running on an old figure.
    expect(result?.resolution).toBe("STALE_FALLBACK");
    expect(result?.ageDays).toBeGreaterThanOrEqual(40);
  });

  it("still treats a 21-day-old price as fresh", () => {
    const result = retrievePriceFor(
      component({ embedding: undefined }),
      candidates(priceDoc({ effectiveFrom: daysAgo(21) }))
    );
    expect(result?.resolution).toBe("CATEGORY");
  });
});

describe("retrievePriceFor — nothing to retrieve", () => {
  it("returns null for a slice that tracks no material", () => {
    expect(retrievePriceFor(component({ category: undefined }), candidates(priceDoc()))).toBeNull();
  });

  it("returns null when the category has no prices at all", () => {
    expect(retrievePriceFor(component(), new Map())).toBeNull();
    expect(retrievePriceFor(component(), candidates())).toBeNull();
  });
});
