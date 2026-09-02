import { CostComponentKind, PriceSource, ProductCategory } from "./enums";

/**
 * Live material pricing, and the thing that makes it usable.
 *
 * Buildora prices a build from the admin-maintained BoqRate table, which is only
 * as fresh as the last time somebody edited it. Meanwhile real suppliers post
 * real prices on the marketplace every week. services/marketDrift has always
 * been able to see that movement — and has always, deliberately, refused to do
 * anything with it, because a per-unit material price and a composite work rate
 * are not the same kind of number:
 *
 *     "RCC works (1:1.5:3) including shuttering" — 520 BDT/cft
 *
 * is cement plus sand plus labour plus formwork. There is no honest way to
 * multiply that by "cement moved 8%".
 *
 * The composition table below is the honest way. It says what fraction of that
 * 520 is cement, so an 8% cement move reprices the ~30% that is actually cement
 * and leaves the wages and the formwork alone. Everything else in the RAG
 * pipeline — the weekly fetch, the retrieval, the audit trail — exists to feed
 * this one idea.
 *
 * Nothing here is consumed by the estimator yet. These are the shapes the data
 * is stored in; wiring them into the figure happens later, once there is real
 * priced data to wire.
 */

/* ---------- Observed prices ---------- */

/**
 * One price for one material, as observed at one moment.
 *
 * Rows are **append-only**. A price is not edited when the market moves — a new
 * row is written and the old one stays exactly as it was. That is the same
 * choice CostEstimateSnapshot makes, and for the same reason: an estimate from
 * March has to still be explainable in August, which is impossible if the prices
 * it was built from have since been overwritten in place.
 */
export interface MarketPrice {
  id: string;
  category: ProductCategory;
  /** What was actually priced, e.g. "OPC cement, 50kg bag". */
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: PriceSource;
  /** Where it came from, for a person checking the claim. */
  sourceName: string;
  sourceUrl?: string;
  /**
   * False until an admin approves it. Only FETCHED rows land false: a scraper
   * meeting a redesigned page must not be able to move an owner's estimate
   * unsupervised.
   */
  approved: boolean;
  /** When this price started applying — not when the row was written. */
  effectiveFrom: string;
  createdAt: string;
}

/**
 * The BBS construction-materials index, entered by hand each month.
 *
 * Per-item prices cover materials we track. This covers everything we don't:
 * it is the single multiplier that answers "this rate was set 14 months ago,
 * roughly how wrong is it now?" — the time-adjustment the estimator has never
 * had.
 *
 * Manual on purpose. BBS publishes as PDF on its own schedule, and a monthly
 * two-minute admin task is worth more than a parser that breaks silently.
 */
export interface CostIndexPoint {
  id: string;
  /** Which series, so a second index can be added without a migration. */
  series: string;
  /** The month it describes, as "YYYY-MM". */
  period: string;
  /** Index value against the series base, e.g. 118.4 where base = 100. */
  indexValue: number;
  sourceName: string;
  sourceUrl?: string;
  createdAt: string;
}

/* ---------- Rate composition ---------- */

/** One slice of a composite work rate. */
export interface CostComponent {
  kind: CostComponentKind;
  /** Which material this slice buys. Set only when kind is MATERIAL. */
  category?: ProductCategory;
  /** Human label, e.g. "cement" or "mason and helper". */
  label: string;
  /** Share of the rate, 0–1. A rate's components sum to 1. */
  fraction: number;
  /**
   * The material price this slice was costed at when the rate was set.
   *
   * Without it a live price is just a number — repricing needs a *ratio*, and a
   * ratio needs something to divide by. "Cement is 540 a bag" adjusts nothing on
   * its own; "cement is 540 against the 505 this rate assumed" is a 7% move on
   * the cement slice.
   *
   * Set only on MATERIAL slices, and always with its unit, because a ratio taken
   * across two different units is nonsense — see repriceLine, which refuses it.
   */
  baselinePriceBdt?: number;
  baselineUnit?: string;
  /**
   * Query vector for retrieval, filled in by the weekly job for MATERIAL slices.
   * Never sent to the browser — it is 384 numbers nobody can read.
   */
  embedding?: number[];
}

/**
 * How one BoqRate line breaks down.
 *
 * The fractions are indicative Dhaka proportions, not measurements — the same
 * standing as the seeded rates themselves, and admin-editable for the same
 * reason. What matters is not that "cement is exactly 30% of RCC", but that the
 * cement share is *stated* and therefore arguable, instead of being an
 * unexaminable lump.
 */
export interface RateComposition {
  id: string;
  /** The BoqRate row this describes. */
  boqRateId: string;
  /** Copied from the rate at seed time, so the table is readable on its own. */
  rateDescription: string;
  components: CostComponent[];
  notes?: string;
}

/** Components must account for the whole rate, give or take rounding. */
export const COMPOSITION_TOLERANCE = 0.001;

/** True when a set of components sums to 1. */
export function compositionSumsToOne(components: { fraction: number }[]): boolean {
  const total = components.reduce((sum, c) => sum + c.fraction, 0);
  return Math.abs(total - 1) <= COMPOSITION_TOLERANCE;
}

/* ---------- What an estimate reports about its prices ---------- */

/**
 * How retrieval found one price. Ordered best to worst — the UI surfaces the
 * worst one, because that is the honest headline.
 */
export type PriceResolution = "SEMANTIC" | "CATEGORY" | "STALE_FALLBACK" | "NONE";

/** One price an estimate was built from, as shown to the owner. */
export interface UsedPrice {
  priceId: string;
  category: string;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: PriceSource;
  sourceName: string;
  sourceUrl?: string;
  resolution: PriceResolution;
  similarity?: number;
  /** Age in days *when the estimate was calculated*, not when it is read. */
  ageDays: number;
  effectiveFrom: string;
}

/**
 * The pricing provenance shown beside an estimate.
 *
 * This is the part an owner can argue with, and it is meant to be. A figure that
 * says "up 4%" invites a shrug; a figure that says "up 4%, because cement is 7%
 * above what this rate assumed, from a listing eleven days old" invites a
 * question — and a question is what an estimate should invite, since it is not a
 * quote.
 *
 * Absent on estimates from the BOQ and bid-backed tiers, which are priced from
 * real numbers for this specific building and are deliberately not adjusted by
 * anything general.
 */
export interface PricingProvenance {
  /** The refresh run these prices came from — the price "version". */
  priceRunId?: string;
  pricedAt?: string;
  prices: UsedPrice[];
  linesRepriced: number;
  /** Lines that fell back to a stale price, or found none. Zero is the good case. */
  linesWithFallback: number;
  originalTotalBdt: number;
  labourBasis?: string | null;
  /** True when anything fell back — what the UI badges. */
  usedFallback: boolean;
}

/**
 * After how long an observed price stops being trusted as current.
 *
 * Set against the weekly fetch: a price that has survived three refresh cycles
 * without being renewed is not "slightly old", it means the source went quiet.
 * Past this the estimator falls back to the curated floor and says so.
 */
export const PRICE_STALE_AFTER_DAYS = 21;

/* ---------- Refresh runs, as the admin console sees them ---------- */

/** One execution of the price refresh — see apps/api PriceRefreshRun. */
export interface PriceRefreshRunSummary {
  id: string;
  trigger: "CRON" | "ENDPOINT" | "ADMIN" | "LAZY" | "SEED" | "IMPORT";
  status: "RUNNING" | "OK" | "PARTIAL" | "FAILED";
  startedAt: string;
  finishedAt?: string;
  pricesWritten: number;
  pricesEmbedded: number;
  /** How many projects' estimates were checked against the new prices. */
  estimatesChecked: number;
  /** How many of those actually changed and got a new snapshot written. */
  estimatesUpdated: number;
  sourcesOk: string[];
  sourcesFailed: { source: string; reason: string }[];
}

/* ---------- The weekly price sheet ---------- */

/**
 * The columns of the admin's weekly CSV, in order.
 *
 * Exported rather than written out twice because three places have to agree on
 * them exactly: the exporter that produces the file, the importer that reads it
 * back, and the admin console that tells a person what to put in each column. A
 * header the importer doesn't recognise is rejected by name, so a sheet edited
 * in Excel with a renamed column fails loudly instead of silently dropping a
 * price.
 */
export const PRICE_SHEET_COLUMNS = [
  "category",
  "itemLabel",
  "unit",
  "priceBdt",
  "sourceName",
  "sourceUrl",
  "effectiveFrom",
] as const;

export type PriceSheetColumn = (typeof PRICE_SHEET_COLUMNS)[number];

/**
 * One row of the sheet as the admin console shows it.
 *
 * This is the *current* view of an append-only collection: one entry per
 * distinct item, holding its newest row. `priceId` is that newest row's id, and
 * it is what an edit is made relative to — editing writes a new row, it never
 * touches the one named here.
 */
export interface PriceSheetItem {
  priceId: string;
  category: string;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  source: PriceSource;
  sourceName: string;
  sourceUrl?: string;
  effectiveFrom: string;
  /** Days since it took effect — what the staleness badge reads. */
  ageDays: number;
  /** How many rows this item has accumulated; its price history depth. */
  revisions: number;
  /** The previous row's price, when there is one — so the console can show the move. */
  previousPriceBdt?: number;
  /** False while a FETCHED row is still waiting for an admin to look at it. */
  approved: boolean;
}

/** A row the importer refused, with the line of the file it was on. */
export interface PriceSheetRowError {
  /** 1-based line number in the uploaded file, counting the header. */
  line: number;
  message: string;
}

/**
 * What an import did.
 *
 * Deliberately more detailed than "ok": an admin who uploads a sheet and is told
 * only that it worked has no way to notice that half of it was a no-op because
 * they edited the wrong copy of the file.
 */
export interface PriceSheetImportReport {
  /** Data rows read from the file, excluding the header. */
  rowsRead: number;
  /** Items that did not exist before this sheet. */
  added: number;
  /** Items whose price moved, each of which wrote a new append-only row. */
  updated: number;
  /** Items already at exactly this price — nothing was written for them. */
  unchanged: number;
  /**
   * Items in the current sheet that this file did not mention. Reported, never
   * retired automatically: a truncated upload must not be able to empty the
   * price sheet by omission.
   */
  missing: string[];
  /** Rows rejected by validation. When non-empty, nothing at all was written. */
  errors: PriceSheetRowError[];
  /** The refresh run recording this import, when one was written. */
  runId?: string;
  pricesEmbedded: number;
  estimatesChecked: number;
  estimatesUpdated: number;
}
