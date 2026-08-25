import {
  CostComponentKind,
  PriceSource,
  type CostComponent,
  type CostLine,
} from "@buildora/shared";
import { CostIndex } from "../models/CostIndex";
import { RateComposition, type RateCompositionDoc } from "../models/RateComposition";
import { loadPriceCandidates, retrievePriceFor, type RetrievedPrice } from "./priceRetrieval";

/**
 * Moving a BOQ rate to today's prices, honestly.
 *
 * ## The thing this had to solve
 *
 * services/marketDrift has always been able to see that cement moved and has
 * always refused to act on it, with a comment explaining why: a BOQ rate is
 * composite. "RCC works (1:1.5:3) including shuttering" at 520 BDT/cft is cement
 * and sand and wages and formwork added together. Multiplying all 520 by a
 * cement movement is not a correction, it is a fabrication that happens to look
 * like one.
 *
 * The composition table is what makes it tractable. Each rate is split into
 * slices with a stated share and a baseline price, so the arithmetic becomes:
 *
 *     new rate = Σ (rate × slice fraction × slice adjustment)
 *
 * where a MATERIAL slice's adjustment is `today's price ÷ its baseline price`,
 * and LABOUR moves on the published construction index instead. FIXED does not
 * move at all.
 *
 * Every step of that is something a person can check. Nobody has to trust it.
 *
 * ## What deliberately does not happen
 *
 * **No language model touches these numbers.** That was already the rule for the
 * estimator and RAG does not change it — the retrieved prices ground what the
 * model is later asked to *write about*, in estimator.controller. The figures
 * themselves are computed here, in TypeScript, from rows in the database.
 *
 * **A slice with no usable price is left alone.** Not guessed at, not
 * interpolated from a neighbouring category. The line keeps its seeded rate and
 * the estimate reports that it fell back, which is the only answer that stays
 * true when somebody checks it.
 */

/** The series seed-market-prices writes, and the one labour is adjusted by. */
const INDEX_SERIES = "CONSTRUCTION_MATERIALS";

/** Below this a repriced rate has barely moved; not worth reporting as a change. */
const REPRICE_NOISE_FLOOR = 0.005;

/**
 * The band a material adjustment has to fall in to be believed.
 *
 * **This guard was added because it caught a real error.** The seeded electrical
 * baseline said 2,800 per coil; the marketplace median came back at 620 per
 * coil. The units matched, the semantic match was good, and the arithmetic
 * dutifully cut the electrical rate by 78% — quietly taking about half a million
 * taka off an eight-storey building's estimate on the strength of one wrong
 * baseline that nobody would have noticed.
 *
 * A factor outside this band is not a price movement. Steel moving 24% in a year
 * is a price movement; a material appearing to have quartered in price is a
 * mismatched baseline, a mis-parsed listing, or two different products sharing a
 * unit. Refusing it and saying so leaves the rate on its stored figure, which is
 * merely out of date — the alternative is confidently wrong, which is worse.
 *
 * The band is deliberately wide. Bangladeshi material prices genuinely do move
 * hard: TCB had 40-grade rod up 23.6% year on year. Doubling or halving is the
 * point at which "the market moved" stops being the likeliest explanation.
 */
const MIN_ADJUSTMENT = 0.5;
const MAX_ADJUSTMENT = 2;

/**
 * Trade units that mean the same thing written differently.
 *
 * Sellers type "50 kg bag", the rate table says "bag", and a naive string
 * comparison refuses the match — which is exactly what happened on first run:
 * cement, the single most important material in the table, never repriced at all
 * because of a spelling difference.
 *
 * **Only genuinely identical units are folded together, never converted.** A
 * cement bag in Bangladesh is 50 kg by convention, so "50kg bag" and "bag" are
 * the same quantity of cement and safe to equate. A "25 kg bag" is deliberately
 * absent: folding that into "bag" would compare half a bag's price against a
 * whole bag's baseline and double the cement cost of every building. When in
 * doubt the unit stays distinct and the slice is refused — a missed adjustment
 * is a small, visible loss; a wrong one is an invisible disaster.
 */
const UNIT_ALIASES: Record<string, string> = {
  bag: "bag",
  "50kg bag": "bag",
  "50 kg bag": "bag",
  "bag 50kg": "bag",
  "bag (50kg)": "bag",
  kg: "kg",
  kilo: "kg",
  kilogram: "kg",
  nos: "nos",
  no: "nos",
  piece: "nos",
  pcs: "nos",
  pc: "nos",
  cft: "cft",
  "cubic feet": "cft",
  sft: "sft",
  "square feet": "sft",
  sqft: "sft",
  ft: "ft",
  feet: "ft",
  litre: "litre",
  liter: "litre",
  ltr: "litre",
  l: "litre",
  coil: "coil",
  // The baseline is explicitly a 100-yard coil and sellers list the same thing
  // as "100 yd coil", so these are one unit written two ways.
  "100 yd coil": "coil",
  "100 yard coil": "coil",
  // Deliberately NOT here: "20 ft length" -> "ft". A length is twenty feet, and
  // folding it into a per-foot baseline would price plumbing at twenty times
  // the truth. The plumbing slice stays unadjusted and says so, which is the
  // correct outcome until someone fixes the baseline unit in admin. This is the
  // guard earning its place — see the note above.
};

/**
 * Reduces a unit to its canonical spelling for comparison.
 *
 * Lowercased, punctuation-stripped, de-pluralised, then looked up. Anything not
 * in the alias table comes back normalised but unmapped, so two spellings of an
 * unknown unit still match each other while never matching a different one.
 */
export function canonicalUnit(unit: string): string {
  const cleaned = unit
    .toLowerCase()
    .replace(/[().]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

/** What happened to one slice — the audit trail, one level down from the line. */
export interface ComponentAdjustment {
  label: string;
  kind: CostComponentKind;
  fraction: number;
  /** What it was multiplied by. 1 means it did not move. */
  factor: number;
  /** The price that produced the factor, when one was found. */
  price?: RetrievedPrice;
  /** Why it did not move, when it didn't. */
  skippedReason?: string;
}

export interface RepricedLine {
  line: CostLine;
  /** The rate before repricing, so the change is visible rather than implied. */
  originalRatePerUnitBdt: number;
  adjustments: ComponentAdjustment[];
  /** True when at least one slice used a stale or fallback price. */
  usedFallback: boolean;
}

/**
 * How much the construction index has moved since the composition baselines were
 * set. Returns 1 when there is nothing to go on, which adjusts nothing.
 *
 * The seeded baseline point is 100 and marked as ours rather than as BBS, so
 * until an admin enters a real published figure this correctly does nothing at
 * all — see scripts/seed-market-prices for why no BBS number was invented.
 */
export async function labourIndexFactor(): Promise<{ factor: number; basis: string | null }> {
  const points = await CostIndex.find({ series: INDEX_SERIES }).sort({ period: -1 }).limit(24);
  if (points.length < 2) return { factor: 1, basis: null };

  const latest = points[0]!;
  const earliest = points[points.length - 1]!;
  if (earliest.indexValue <= 0) return { factor: 1, basis: null };

  return {
    factor: latest.indexValue / earliest.indexValue,
    basis: `${earliest.period} to ${latest.period}`,
  };
}

/**
 * Works out one slice's multiplier.
 *
 * The unit check is the important line in here. A cement baseline priced per bag
 * and a marketplace median priced per kg produce a ratio of about sixty, and
 * applying it would multiply a building's concrete cost by sixty. Units that do
 * not match are refused, not converted — we do not know what a seller meant by
 * "unit", and guessing at it is exactly the class of error this whole file
 * exists to avoid.
 */
function adjustmentFor(
  component: CostComponent,
  price: RetrievedPrice | null,
  labour: { factor: number; basis: string | null }
): ComponentAdjustment {
  const base: ComponentAdjustment = {
    label: component.label,
    kind: component.kind,
    fraction: component.fraction,
    factor: 1,
  };

  if (component.kind === CostComponentKind.LABOUR) {
    return labour.basis
      ? { ...base, factor: labour.factor }
      : { ...base, skippedReason: "no published index point to adjust wages by" };
  }

  if (component.kind === CostComponentKind.FIXED) {
    return { ...base, skippedReason: "plant and overhead are not price-tracked" };
  }

  if (!price) return { ...base, skippedReason: "no price found for this material" };
  if (!component.baselinePriceBdt || component.baselinePriceBdt <= 0) {
    return { ...base, skippedReason: "no baseline price to compare against" };
  }
  if (
    component.baselineUnit &&
    canonicalUnit(price.unit) !== canonicalUnit(component.baselineUnit)
  ) {
    return {
      ...base,
      price,
      skippedReason: `priced per ${price.unit} but costed per ${component.baselineUnit} — not comparable`,
    };
  }

  const factor = price.priceBdt / component.baselinePriceBdt;

  // The sanity band — see the note on MIN_ADJUSTMENT for the error this caught.
  if (factor < MIN_ADJUSTMENT || factor > MAX_ADJUSTMENT) {
    return {
      ...base,
      price,
      skippedReason:
        `${price.priceBdt}/${price.unit} against a ${component.baselinePriceBdt}/${component.baselineUnit} baseline ` +
        `is a ${factor.toFixed(2)}x move — refused as a data mismatch, not a price change`,
    };
  }

  return { ...base, price, factor };
}

/**
 * Reprices one BOQ line against today's data.
 *
 * Returns the line unchanged when there is no composition for it, which is the
 * correct outcome for an admin-added rate nobody has broken down yet.
 */
export function repriceLine(
  line: CostLine,
  composition: RateCompositionDoc | undefined,
  candidates: Awaited<ReturnType<typeof loadPriceCandidates>>,
  labour: { factor: number; basis: string | null }
): RepricedLine {
  if (!composition || composition.components.length === 0) {
    return {
      line,
      originalRatePerUnitBdt: line.ratePerUnitBdt,
      adjustments: [],
      usedFallback: false,
    };
  }

  const adjustments = composition.components.map((component) =>
    adjustmentFor(component, retrievePriceFor(component, candidates), labour)
  );

  // Σ (fraction × factor). With every factor at 1 this sums back to 1 exactly,
  // because the fractions are validated to sum to 1 — so a rate with nothing to
  // adjust comes out of here untouched rather than subtly rounded.
  const multiplier = adjustments.reduce((sum, a) => sum + a.fraction * a.factor, 0);

  const newRate = Math.round(line.ratePerUnitBdt * multiplier);
  const moved = Math.abs(multiplier - 1) >= REPRICE_NOISE_FLOOR;

  return {
    line: moved
      ? {
          ...line,
          ratePerUnitBdt: newRate,
          totalBdt: Math.round(newRate * line.quantity),
        }
      : line,
    originalRatePerUnitBdt: line.ratePerUnitBdt,
    adjustments,
    // A material slice counts as a fallback whenever it did not actually get a
    // live price: none found, one found but refused, or one so old it is only
    // nominally current. All three leave that part of the line on its stored
    // rate, and the owner is entitled to know that.
    usedFallback: adjustments.some(
      (a) =>
        a.price?.resolution === "STALE_FALLBACK" ||
        (a.kind === CostComponentKind.MATERIAL && (!a.price || Boolean(a.skippedReason)))
    ),
  };
}

/** Everything repricing a whole estimate needs, loaded in one go. */
export interface RepricingContext {
  candidates: Awaited<ReturnType<typeof loadPriceCandidates>>;
  compositions: Map<string, RateCompositionDoc>;
  labour: { factor: number; basis: string | null };
}

/**
 * Loads the pricing context once per estimate.
 *
 * Three reads total, however many lines the estimate has. Compositions are keyed
 * by rate description because that is what a CostLine carries — the line has
 * already been flattened out of the rate table by the time it reaches here.
 */
export async function loadRepricingContext(): Promise<RepricingContext> {
  const [candidates, compositions, labour] = await Promise.all([
    loadPriceCandidates(),
    RateComposition.find(),
    labourIndexFactor(),
  ]);

  return {
    candidates,
    compositions: new Map(compositions.map((c) => [c.rateDescription, c])),
    labour,
  };
}

/** Summary of a whole estimate's repricing, for storage and for the owner. */
export interface RepricingSummary {
  /** Lines whose rate actually moved. */
  linesRepriced: number;
  /** Lines that fell back to a stale price or found none at all. */
  linesWithFallback: number;
  /** Every distinct price row used, for the audit trail. */
  pricesUsed: RetrievedPrice[];
  /** How wages were adjusted, or null when no index point exists yet. */
  labourBasis: string | null;
  /** Total before repricing, so the shift is visible. */
  originalTotalBdt: number;
}

/**
 * Reprices a whole set of lines and reports what happened.
 *
 * The summary is not decoration. It is what gets stored on the snapshot (phase
 * 4) and what the owner is shown, and it is the difference between "your
 * estimate went up 4%" and "your estimate went up 4% because cement is up 7%
 * against what this rate assumed, from a listing dated last Tuesday".
 */
export function repriceLines(
  lines: CostLine[],
  context: RepricingContext
): { lines: CostLine[]; summary: RepricingSummary } {
  const originalTotalBdt = lines.reduce((sum, l) => sum + l.totalBdt, 0);

  const repriced = lines.map((line) =>
    repriceLine(
      line,
      context.compositions.get(line.description),
      context.candidates,
      context.labour
    )
  );

  // Deduplicated by price id — one cement listing informing four lines is one
  // source, and listing it four times would make the provenance unreadable.
  //
  // Skipped adjustments are excluded even though they carry a price. A price
  // that was retrieved and then refused — wrong unit, implausible factor — did
  // not produce this figure, and listing it under "prices used" would make the
  // audit trail claim something untrue. The reason it was refused is still on
  // the adjustment for anyone debugging.
  const seen = new Set<string>();
  const pricesUsed: RetrievedPrice[] = [];
  for (const r of repriced) {
    for (const a of r.adjustments) {
      if (!a.price || a.skippedReason || seen.has(a.price.priceId)) continue;
      seen.add(a.price.priceId);
      pricesUsed.push(a.price);
    }
  }

  return {
    lines: repriced.map((r) => r.line),
    summary: {
      linesRepriced: repriced.filter((r) => r.line.ratePerUnitBdt !== r.originalRatePerUnitBdt)
        .length,
      linesWithFallback: repriced.filter((r) => r.usedFallback).length,
      pricesUsed,
      labourBasis: context.labour.basis,
      originalTotalBdt,
    },
  };
}

/** Prices worth naming in the narrative — the live ones that actually moved something. */
export function groundingPrices(summary: RepricingSummary): RetrievedPrice[] {
  return summary.pricesUsed
    .filter((p) => p.resolution === "SEMANTIC" || p.resolution === "CATEGORY")
    .sort((a, b) => {
      // Marketplace medians first: they are the freshest and the most defensible.
      const rank = (p: RetrievedPrice) => (p.source === PriceSource.MARKETPLACE ? 0 : 1);
      return rank(a) - rank(b) || a.ageDays - b.ageDays;
    })
    .slice(0, 8);
}
