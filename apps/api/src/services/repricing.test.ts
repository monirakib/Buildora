import { describe, expect, it } from "vitest";
import {
  CostComponentKind,
  PriceSource,
  ProductCategory,
  type CostComponent,
  type CostLine,
} from "@buildora/shared";
import { canonicalUnit, repriceLine } from "./repricing";
import type { RetrievedPrice } from "./priceRetrieval";
import type { MarketPriceDoc } from "../models/MarketPrice";

/**
 * The two guards in this file were both added after a live run got something
 * wrong, and both fail *silently* when broken — a repriced estimate looks
 * exactly as plausible whether the number behind it is right or not. That is
 * what makes them worth pinning down in a test rather than eyeballing.
 */

/** A candidate price in the shape retrievePriceFor returns. */
function price(over: Partial<RetrievedPrice> = {}): RetrievedPrice {
  return {
    category: ProductCategory.CEMENT,
    itemLabel: "OPC cement, 50kg bag",
    unit: "bag",
    priceBdt: 540,
    source: PriceSource.CURATED,
    sourceName: "test",
    effectiveFrom: new Date(),
    ageDays: 1,
    resolution: "SEMANTIC",
    priceId: "p1",
    ...over,
  };
}

/**
 * repriceLine takes its candidates as a Map and looks them up through
 * retrievePriceFor, which ranks within a category. One fresh, un-embedded row
 * per category resolves deterministically without loading a model.
 */
function candidatesFor(p: RetrievedPrice) {
  const doc = {
    _id: p.priceId,
    category: p.category,
    itemLabel: p.itemLabel,
    unit: p.unit,
    priceBdt: p.priceBdt,
    source: p.source,
    sourceName: p.sourceName,
    approved: true,
    effectiveFrom: p.effectiveFrom,
    createdAt: p.effectiveFrom,
    updatedAt: p.effectiveFrom,
  } as unknown as MarketPriceDoc;
  return new Map([[p.category, [doc]]]);
}

function material(over: Partial<CostComponent> = {}): CostComponent {
  return {
    kind: CostComponentKind.MATERIAL,
    category: ProductCategory.CEMENT,
    label: "cement",
    fraction: 1,
    baselinePriceBdt: 500,
    baselineUnit: "bag",
    ...over,
  };
}

const LINE: CostLine = {
  description: "RCC works (1:1.5:3) including shuttering",
  category: "STRUCTURE",
  unit: "cft",
  quantity: 100,
  ratePerUnitBdt: 500,
  totalBdt: 50_000,
};

const NO_LABOUR_INDEX = { factor: 1, basis: null };

function reprice(component: CostComponent, p: RetrievedPrice) {
  return repriceLine(
    LINE,
    { components: [component] } as never,
    candidatesFor(p) as never,
    NO_LABOUR_INDEX
  );
}

describe("canonicalUnit", () => {
  it("folds the spellings of a cement bag onto one unit", () => {
    // The bug this table exists for: cement never repriced at all, because
    // sellers write "50 kg bag" and the rate table says "bag".
    for (const spelling of ["bag", "Bags", "50kg bag", "50 kg bag", "Bag (50kg)"]) {
      expect(canonicalUnit(spelling)).toBe("bag");
    }
  });

  it("normalises case, plurals and punctuation", () => {
    expect(canonicalUnit("Pieces")).toBe("nos");
    expect(canonicalUnit("Cubic Feet")).toBe("cft");
    expect(canonicalUnit("  Litres ")).toBe("litre");
  });

  it("leaves an unknown unit distinct rather than guessing at it", () => {
    // Two spellings of the same unknown unit still match each other...
    expect(canonicalUnit("Drums")).toBe(canonicalUnit("drum"));
    // ...but nothing folds them into a unit they are not.
    expect(canonicalUnit("drum")).not.toBe("litre");
  });

  it("refuses to fold a quantity into a rate — 20 ft length is not ft", () => {
    // Deliberately absent from the alias table: folding this would price
    // plumbing at twenty times the truth.
    expect(canonicalUnit("20 ft length")).not.toBe("ft");
  });

  it("keeps a 25 kg bag distinct from a 50 kg bag", () => {
    // Equating these would compare half a bag's price against a whole bag's
    // baseline and double the cement cost of every building.
    expect(canonicalUnit("25 kg bag")).not.toBe("bag");
  });
});

describe("repriceLine — the unit guard", () => {
  it("applies a price quoted in the baseline's unit", () => {
    const result = reprice(material(), price({ priceBdt: 540, unit: "bag" }));
    // 540/500 = 1.08 on a slice that is the whole rate.
    expect(result.line.ratePerUnitBdt).toBe(540);
    expect(result.adjustments[0]?.skippedReason).toBeUndefined();
  });

  it("accepts a differently spelled but identical unit", () => {
    const result = reprice(material(), price({ unit: "50 kg bag" }));
    expect(result.line.ratePerUnitBdt).toBe(540);
  });

  it("refuses a price quoted per a unit the rate is not costed in", () => {
    const result = reprice(material({ baselineUnit: "bag" }), price({ unit: "kg", priceBdt: 11 }));
    expect(result.adjustments[0]?.skippedReason).toMatch(/not comparable/);
    // The rate is left exactly as stored — out of date beats wrong.
    expect(result.line.ratePerUnitBdt).toBe(LINE.ratePerUnitBdt);
  });
});

describe("repriceLine — the plausibility band", () => {
  it("accepts a hard but real price movement", () => {
    // Rod was genuinely up ~24% year on year; that must not be refused.
    const result = reprice(material({ baselinePriceBdt: 100 }), price({ priceBdt: 124 }));
    expect(result.adjustments[0]?.skippedReason).toBeUndefined();
    expect(result.line.ratePerUnitBdt).toBe(620);
  });

  it("refuses a price that quartered — the electrical-baseline bug", () => {
    // A 2800/coil seeded baseline against a real 620/coil listing silently cut
    // ~500k BDT off an eight-storey estimate before this guard existed.
    const result = reprice(
      material({
        category: ProductCategory.ELECTRICAL,
        baselinePriceBdt: 2800,
        baselineUnit: "coil",
      }),
      price({ category: ProductCategory.ELECTRICAL, priceBdt: 620, unit: "coil" })
    );
    expect(result.adjustments[0]?.skippedReason).toMatch(/data mismatch/);
    expect(result.line.ratePerUnitBdt).toBe(LINE.ratePerUnitBdt);
  });

  it("refuses a price that more than doubled", () => {
    const result = reprice(material({ baselinePriceBdt: 100 }), price({ priceBdt: 250 }));
    expect(result.adjustments[0]?.skippedReason).toMatch(/data mismatch/);
  });

  it("holds the band open at exactly 0.5x and 2x", () => {
    // The boundary is inclusive — these are the last accepted moves. 540 against
    // a 1080 baseline is exactly 0.5x; against 270 it is exactly 2x.
    expect(
      reprice(material({ baselinePriceBdt: 1080 }), price()).adjustments[0]?.skippedReason
    ).toBeUndefined();
    expect(
      reprice(material({ baselinePriceBdt: 270 }), price()).adjustments[0]?.skippedReason
    ).toBeUndefined();
  });
});

describe("repriceLine — leaving things alone", () => {
  it("returns the line untouched when the rate has no composition", () => {
    const result = repriceLine(LINE, undefined, new Map() as never, NO_LABOUR_INDEX);
    expect(result.line).toBe(LINE);
    expect(result.adjustments).toEqual([]);
    expect(result.usedFallback).toBe(false);
  });

  it("never adjusts a fixed slice, and says why", () => {
    const result = reprice(
      { kind: CostComponentKind.FIXED, label: "formwork and plant", fraction: 1 },
      price()
    );
    expect(result.adjustments[0]?.skippedReason).toMatch(/not price-tracked/);
    expect(result.line.ratePerUnitBdt).toBe(LINE.ratePerUnitBdt);
  });

  it("skips wages when no index point has been published", () => {
    const result = reprice(
      { kind: CostComponentKind.LABOUR, label: "mason", fraction: 1 },
      price()
    );
    expect(result.adjustments[0]?.skippedReason).toMatch(/no published index/);
  });

  it("flags a fallback when a material slice got no usable price", () => {
    const result = reprice(material({ baselineUnit: "bag" }), price({ unit: "kg" }));
    // The owner is entitled to know part of this number is still the stored one.
    expect(result.usedFallback).toBe(true);
  });
});
