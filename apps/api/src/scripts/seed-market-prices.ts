/**
 * Seeds the pricing layer: observed material prices, the inflation index, and
 * the composition table that ties them to the BOQ rates. Run from apps/api:
 * `pnpm seed:prices`. Safe to re-run — it only inserts into collections that are
 * still empty, so admin edits are never overwritten.
 *
 * **Read the `sourceName` on every price row.** Two kinds are seeded here and
 * they are not equally trustworthy:
 *
 *   - Rows citing a real publisher (TCB via the Business Standard, Bashundhara's
 *     own price page) are figures actually published by those sources, with the
 *     URL to check them against. They were current when written and will go
 *     stale like anything else.
 *   - Rows marked "Buildora indicative Dhaka baseline" are *ours*. Nobody
 *     published them. They exist so the pipeline has a complete set of
 *     categories to work with instead of holes, and they carry no authority
 *     beyond the seeded BoqRate values they were derived from.
 *
 * Nothing here is attributed to a source that did not publish it. An estimate
 * that cites BBS had better be quoting BBS.
 *
 * `seed:build` must have run first — the compositions are attached to BoqRate
 * rows by description, so the rates have to exist.
 */
import mongoose from "mongoose";
import { CostComponentKind, PriceSource, ProductCategory } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { BoqRate } from "../models/BoqRate";
import { CostIndex } from "../models/CostIndex";
import { MarketPrice } from "../models/MarketPrice";
import { RateComposition } from "../models/RateComposition";

/** Our own figures, derived from the seeded rates. Never a real publisher's name. */
const OWN = "Buildora indicative Dhaka baseline";

/**
 * Observed prices, in the units these materials are actually traded in.
 *
 * `effectiveFrom` is deliberately the day the figure was published rather than
 * the day the seed runs, so the staleness check tells the truth about how old
 * these are the moment the database is created.
 */
const PRICES = [
  // ---- Published figures, with sources ----
  {
    category: ProductCategory.CEMENT,
    itemLabel: "OPC cement, 50kg bag",
    unit: "bag",
    priceBdt: 540,
    sourceName: "Bashundhara Cement published price list",
    sourceUrl: "https://www.bashundharacement.com/cement-price-in-bangladesh/",
    effectiveFrom: new Date("2026-04-30"),
  },
  {
    category: ProductCategory.CEMENT,
    itemLabel: "PCC cement, 50kg bag",
    unit: "bag",
    priceBdt: 505,
    sourceName: "Bashundhara Cement published price list",
    sourceUrl: "https://www.bashundharacement.com/cement-price-in-bangladesh/",
    effectiveFrom: new Date("2026-04-30"),
  },
  {
    category: ProductCategory.STEEL,
    itemLabel: "MS deformed bar, 60 grade",
    unit: "kg",
    // Reported at Tk90,000–93,000 per tonne; stored per kg, the unit the BOQ
    // reinforcement line is measured in.
    priceBdt: 91.5,
    sourceName: "TCB, reported by The Business Standard",
    sourceUrl:
      "https://www.tbsnews.net/economy/rod-prices-jump-tk10000-tonne-10-days-cement-tk25-bag-1384486",
    effectiveFrom: new Date("2026-04-30"),
  },
  {
    category: ProductCategory.STEEL,
    itemLabel: "MS deformed bar, 40 grade",
    unit: "kg",
    priceBdt: 84,
    sourceName: "TCB, reported by The Business Standard",
    sourceUrl:
      "https://www.tbsnews.net/economy/rod-prices-jump-tk10000-tonne-10-days-cement-tk25-bag-1384486",
    effectiveFrom: new Date("2026-04-30"),
  },

  // ---- Our own baselines, so every category has a floor to fall back to ----
  {
    category: ProductCategory.BRICKS,
    itemLabel: "First class brick",
    unit: "nos",
    priceBdt: 13,
    sourceName: OWN,
  },
  {
    category: ProductCategory.SAND_AGGREGATE,
    itemLabel: "Sylhet sand, coarse",
    unit: "cft",
    priceBdt: 55,
    sourceName: OWN,
  },
  {
    category: ProductCategory.TILES,
    itemLabel: "Homogeneous floor tile",
    unit: "sft",
    priceBdt: 130,
    sourceName: OWN,
  },
  {
    category: ProductCategory.PAINT,
    itemLabel: "Plastic paint, interior",
    unit: "litre",
    priceBdt: 420,
    sourceName: OWN,
  },
  {
    category: ProductCategory.ELECTRICAL,
    itemLabel: "PVC insulated copper wire, 100 yard coil",
    unit: "coil",
    priceBdt: 2800,
    sourceName: OWN,
  },
  {
    category: ProductCategory.PLUMBING,
    itemLabel: "uPVC pipe, 1 inch",
    unit: "ft",
    priceBdt: 55,
    sourceName: OWN,
  },
  {
    category: ProductCategory.WOOD,
    itemLabel: "Mehogini door shutter",
    unit: "sft",
    priceBdt: 600,
    sourceName: OWN,
  },
];

/**
 * How each seeded BOQ rate breaks down, keyed by the rate's description.
 *
 * Two things to notice, because both are easy to get wrong:
 *
 *   1. **RCC carries no steel slice.** Reinforcement is its own BOQ line
 *      ("MS deformed bar"), so pricing steel into RCC as well would count the
 *      same rod twice.
 *   2. **Every LABOUR slice is named.** That is the point of the exercise as
 *      much as the material tracking is — wages were previously invisible
 *      inside these rates, and an estimate that cannot show its labour content
 *      cannot be argued with.
 *
 * Fractions are indicative Dhaka proportions and must sum to 1; the schema
 * rejects a set that doesn't.
 */
interface SeedComponent {
  kind: CostComponentKind;
  /** Set only on MATERIAL slices — it is the link to a live price. */
  category?: ProductCategory;
  label: string;
  fraction: number;
  /** Overrides the category default below, where a line uses a different grade. */
  baselinePriceBdt?: number;
  baselineUnit?: string;
}

/**
 * What each material slice is assumed to have been costed at.
 *
 * Repricing needs a ratio, and a ratio needs a denominator: "cement is 540 a
 * bag" adjusts nothing until you also know the rate assumed 505. These are the
 * same figures seeded into MarketPrice above, so the two tables agree on day one
 * and every later movement is measured from a stated starting point.
 *
 * ProductCategory.OTHER is deliberately absent. It is a grab bag — roof
 * membrane, an imported lift, a generator — and a single "price of other" would
 * be meaningless. Those slices get no baseline and are left unadjusted, which
 * the estimate reports rather than hides.
 */
const BASELINES: Partial<Record<ProductCategory, { priceBdt: number; unit: string }>> = {
  [ProductCategory.CEMENT]: { priceBdt: 505, unit: "bag" },
  [ProductCategory.STEEL]: { priceBdt: 91.5, unit: "kg" },
  [ProductCategory.BRICKS]: { priceBdt: 13, unit: "nos" },
  [ProductCategory.SAND_AGGREGATE]: { priceBdt: 55, unit: "cft" },
  [ProductCategory.TILES]: { priceBdt: 130, unit: "sft" },
  [ProductCategory.PAINT]: { priceBdt: 420, unit: "litre" },
  [ProductCategory.ELECTRICAL]: { priceBdt: 2800, unit: "coil" },
  [ProductCategory.PLUMBING]: { priceBdt: 55, unit: "ft" },
  [ProductCategory.WOOD]: { priceBdt: 600, unit: "sft" },
};

const COMPOSITIONS: Record<string, { components: SeedComponent[]; notes?: string }> = {
  "Earthwork excavation in foundation": {
    components: [
      { kind: CostComponentKind.LABOUR, label: "excavation labour", fraction: 0.85 },
      { kind: CostComponentKind.FIXED, label: "tools and plant", fraction: 0.15 },
    ],
    notes: "Almost pure labour — no material is bought, only soil moved.",
  },
  "Sand filling in foundation and plinth": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.SAND_AGGREGATE,
        label: "filling sand",
        fraction: 0.65,
      },
      { kind: CostComponentKind.LABOUR, label: "spreading and compaction", fraction: 0.35 },
    ],
  },
  "Cement concrete (1:3:6) with brick chips": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.CEMENT,
        label: "cement",
        fraction: 0.25,
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.SAND_AGGREGATE,
        label: "sand and brick chips",
        fraction: 0.35,
      },
      { kind: CostComponentKind.LABOUR, label: "mixing, laying, curing", fraction: 0.3 },
      { kind: CostComponentKind.FIXED, label: "mixer and plant", fraction: 0.1 },
    ],
  },
  "RCC works (1:1.5:3) including shuttering": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.CEMENT,
        label: "cement",
        fraction: 0.3,
        // Structural concrete uses OPC, which is dearer than the PCC the
        // mortar and plaster lines assume — hence the override.
        baselinePriceBdt: 540,
        baselineUnit: "bag",
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.SAND_AGGREGATE,
        label: "sand and stone chips",
        fraction: 0.2,
      },
      { kind: CostComponentKind.LABOUR, label: "casting, shuttering, curing", fraction: 0.28 },
      { kind: CostComponentKind.FIXED, label: "formwork and props", fraction: 0.22 },
    ],
    notes:
      "No steel slice: reinforcement is priced on its own BOQ line, and including it here would count the same rod twice.",
  },
  "MS deformed bar reinforcement (60 grade)": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.STEEL,
        label: "deformed bar",
        fraction: 0.88,
      },
      { kind: CostComponentKind.LABOUR, label: "cutting, bending, binding", fraction: 0.12 },
    ],
    notes: "The most steel-exposed line in the table — a rod price move shows up here first.",
  },
  "Brick work, 5 inch wall": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.BRICKS,
        label: "bricks",
        fraction: 0.5,
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.CEMENT,
        label: "cement for mortar",
        fraction: 0.12,
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.SAND_AGGREGATE,
        label: "sand for mortar",
        fraction: 0.08,
      },
      { kind: CostComponentKind.LABOUR, label: "mason and helper", fraction: 0.3 },
    ],
  },
  "Plaster work, internal and external faces": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.CEMENT,
        label: "cement",
        fraction: 0.25,
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.SAND_AGGREGATE,
        label: "sand",
        fraction: 0.15,
      },
      { kind: CostComponentKind.LABOUR, label: "plasterer and helper", fraction: 0.6 },
    ],
    notes: "Labour-dominated — a cement move barely touches this line.",
  },
  "Homogeneous floor tiles laid and grouted": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.TILES,
        label: "tiles",
        fraction: 0.62,
      },
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.CEMENT,
        label: "cement and grout",
        fraction: 0.08,
      },
      { kind: CostComponentKind.LABOUR, label: "tile fixing", fraction: 0.3 },
    ],
  },
  "Plastic paint, internal and external": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.PAINT,
        label: "paint and primer",
        fraction: 0.55,
      },
      { kind: CostComponentKind.LABOUR, label: "surface prep and painting", fraction: 0.45 },
    ],
  },
  "Doors and windows, supply and fixing": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.WOOD,
        label: "shutters and frames",
        fraction: 0.7,
      },
      { kind: CostComponentKind.LABOUR, label: "carpentry and fixing", fraction: 0.2 },
      { kind: CostComponentKind.FIXED, label: "hardware and fittings", fraction: 0.1 },
    ],
  },
  "Roof treatment and waterproofing": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.OTHER,
        label: "membrane and chemicals",
        fraction: 0.6,
      },
      { kind: CostComponentKind.LABOUR, label: "application", fraction: 0.4 },
    ],
  },
  "Electrical wiring, points and fittings": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.ELECTRICAL,
        label: "cable, points, fittings",
        fraction: 0.65,
      },
      { kind: CostComponentKind.LABOUR, label: "electrician", fraction: 0.35 },
    ],
  },
  "Plumbing and sanitary installation": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.PLUMBING,
        label: "pipe, fittings, sanitaryware",
        fraction: 0.65,
      },
      { kind: CostComponentKind.LABOUR, label: "plumber", fraction: 0.35 },
    ],
  },
  "Passenger lift, supply and installation": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.OTHER,
        label: "lift unit, imported",
        fraction: 0.9,
      },
      { kind: CostComponentKind.LABOUR, label: "installation and commissioning", fraction: 0.1 },
    ],
    notes: "Imported plant — moves with the exchange rate, not with local material prices.",
  },
  "Generator and substation": {
    components: [
      {
        kind: CostComponentKind.MATERIAL,
        category: ProductCategory.OTHER,
        label: "generator and switchgear",
        fraction: 0.9,
      },
      { kind: CostComponentKind.LABOUR, label: "installation and commissioning", fraction: 0.1 },
    ],
    notes: "Imported plant — moves with the exchange rate, not with local material prices.",
  },
};

/**
 * The index series the estimator will read for time adjustment.
 *
 * Seeded at 100 for the current month and marked as ours, **not** as BBS. We do
 * not have a BBS figure to hand and inventing one would put a fabricated number
 * under a real government agency's name in a system that shows its sources to
 * owners. An admin replaces this with the published figure; until they do, a
 * baseline of 100 adjusts nothing, which is the correct behaviour for "we don't
 * know yet".
 */
const INDEX_SERIES = "CONSTRUCTION_MATERIALS";

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[seed:prices] No database connection, set MONGODB_URI first.");
    process.exit(1);
  }

  // ---- Observed prices ----
  const priceCount = await MarketPrice.countDocuments();
  if (priceCount === 0) {
    await MarketPrice.insertMany(
      PRICES.map((p) => ({
        ...p,
        source: PriceSource.CURATED,
        // Curated rows are trusted on arrival; only the scraper's output waits
        // for review.
        approved: true,
        effectiveFrom: p.effectiveFrom ?? new Date(),
      }))
    );
    console.log(`[seed:prices] inserted ${PRICES.length} curated prices`);
  } else {
    console.log(`[seed:prices] ${priceCount} prices already present, left alone`);
  }

  // ---- Inflation index ----
  const indexCount = await CostIndex.countDocuments();
  if (indexCount === 0) {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await CostIndex.create({
      series: INDEX_SERIES,
      period,
      indexValue: 100,
      sourceName: `${OWN} (replace with the published BBS figure)`,
    });
    console.log(`[seed:prices] inserted baseline index point for ${period}`);
  } else {
    console.log(`[seed:prices] ${indexCount} index points already present, left alone`);
  }

  // ---- Rate compositions ----
  const compositionCount = await RateComposition.countDocuments();
  if (compositionCount === 0) {
    const rates = await BoqRate.find();
    if (rates.length === 0) {
      console.error("[seed:prices] No BOQ rates found — run `pnpm seed:build` first.");
      await mongoose.disconnect();
      process.exit(1);
    }

    const docs = [];
    const unmatched: string[] = [];
    for (const rate of rates) {
      const composition = COMPOSITIONS[rate.description];
      if (!composition) {
        unmatched.push(rate.description);
        continue;
      }
      docs.push({
        boqRate: rate._id,
        rateDescription: rate.description,
        // Material slices pick up the category baseline unless the line stated
        // its own. Labour and fixed slices get none — nothing prices them.
        components: composition.components.map((c) =>
          c.category
            ? {
                ...c,
                baselinePriceBdt: c.baselinePriceBdt ?? BASELINES[c.category]?.priceBdt,
                baselineUnit: c.baselineUnit ?? BASELINES[c.category]?.unit,
              }
            : c
        ),
        notes: composition.notes,
      });
    }

    if (docs.length > 0) await RateComposition.insertMany(docs);
    console.log(`[seed:prices] inserted ${docs.length} rate compositions`);

    // An admin-added rate has no composition and simply won't be repriced from
    // live data — worth saying out loud rather than discovering later.
    if (unmatched.length > 0) {
      console.warn(
        `[seed:prices] ${unmatched.length} rate(s) have no composition and won't reprice:\n  ` +
          unmatched.join("\n  ")
      );
    }
  } else {
    console.log(`[seed:prices] ${compositionCount} compositions already present, left alone`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed:prices] failed:", err);
  process.exit(1);
});
