/**
 * Loads starter construction reference data — BOQ rates and inspection
 * checklists — so tendering and milestone sign-off have something to work with
 * on a fresh database. Run from apps/api: `pnpm seed:build`. Safe to re-run:
 * it only inserts into collections that are still empty, so admin edits are
 * never overwritten.
 *
 * The rates are **indicative starter values for Dhaka**, not a price list.
 * They exist so an owner drafting a tender sees a filled table instead of a
 * blank one, and so the comparison view has something to measure a bid
 * against. Admins maintain the real ones; that is the whole reason they live
 * in the database.
 *
 * `quantityPerSqft` is how much of an item a square foot of built-up area
 * typically consumes, which is what turns the architect's floor plan into a
 * starting BOQ. Items an owner has to quantify themselves — a lift, a
 * generator — carry zero, so they appear in the table at zero quantity rather
 * than silently inflating the estimate.
 */
import mongoose from "mongoose";
import { DEFAULT_INSPECTION_ITEMS } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { BoqRate } from "../models/BoqRate";
import { InspectionTemplate } from "../models/InspectionTemplate";

const BOQ_RATES = [
  // ---- Substructure ----
  {
    description: "Earthwork excavation in foundation",
    unit: "cft",
    quantityPerSqft: 0.15,
    ratePerUnitBdt: 30,
    category: "Substructure",
    order: 10,
  },
  {
    description: "Sand filling in foundation and plinth",
    unit: "cft",
    quantityPerSqft: 0.12,
    ratePerUnitBdt: 55,
    category: "Substructure",
    order: 20,
  },
  {
    description: "Cement concrete (1:3:6) with brick chips",
    unit: "cft",
    quantityPerSqft: 0.03,
    ratePerUnitBdt: 260,
    category: "Substructure",
    order: 30,
  },
  // ---- Structure ----
  {
    description: "RCC works (1:1.5:3) including shuttering",
    unit: "cft",
    quantityPerSqft: 0.09,
    ratePerUnitBdt: 520,
    category: "Structure",
    order: 40,
  },
  {
    description: "MS deformed bar reinforcement (60 grade)",
    unit: "kg",
    quantityPerSqft: 3.2,
    ratePerUnitBdt: 105,
    category: "Structure",
    order: 50,
  },
  // ---- Masonry & finishes ----
  {
    description: "Brick work, 5 inch wall",
    unit: "sft",
    quantityPerSqft: 0.55,
    ratePerUnitBdt: 195,
    category: "Masonry & finishes",
    order: 60,
  },
  {
    description: "Plaster work, internal and external faces",
    unit: "sft",
    quantityPerSqft: 1.8,
    ratePerUnitBdt: 45,
    category: "Masonry & finishes",
    order: 70,
  },
  {
    description: "Homogeneous floor tiles laid and grouted",
    unit: "sft",
    quantityPerSqft: 0.95,
    ratePerUnitBdt: 210,
    category: "Masonry & finishes",
    order: 80,
  },
  {
    description: "Plastic paint, internal and external",
    unit: "sft",
    quantityPerSqft: 2.1,
    ratePerUnitBdt: 38,
    category: "Masonry & finishes",
    order: 90,
  },
  {
    description: "Doors and windows, supply and fixing",
    unit: "sft",
    quantityPerSqft: 0.18,
    ratePerUnitBdt: 850,
    category: "Masonry & finishes",
    order: 100,
  },
  {
    description: "Roof treatment and waterproofing",
    unit: "sft",
    quantityPerSqft: 0.12,
    ratePerUnitBdt: 260,
    category: "Masonry & finishes",
    order: 110,
  },
  // ---- Services ----
  {
    description: "Electrical wiring, points and fittings",
    unit: "sft",
    quantityPerSqft: 1,
    ratePerUnitBdt: 180,
    category: "Services",
    order: 120,
  },
  {
    description: "Plumbing and sanitary installation",
    unit: "sft",
    quantityPerSqft: 1,
    ratePerUnitBdt: 165,
    category: "Services",
    order: 130,
  },
  // ---- Optional: quantified by the owner, never derived from area ----
  {
    description: "Passenger lift, supply and installation",
    unit: "nos",
    quantityPerSqft: 0,
    ratePerUnitBdt: 1_800_000,
    category: "Optional",
    order: 140,
  },
  {
    description: "Generator and substation",
    unit: "nos",
    quantityPerSqft: 0,
    ratePerUnitBdt: 950_000,
    category: "Optional",
    order: 150,
  },
];

const TEMPLATES = [
  {
    name: "General stage inspection",
    description: "Default checklist, suitable for any milestone.",
    items: DEFAULT_INSPECTION_ITEMS,
  },
  {
    name: "Foundation & substructure",
    description: "Before backfilling — once it's buried, nobody can check it.",
    items: [
      "Excavation depth and bearing stratum match the soil report",
      "Base concrete thickness and level as drawn",
      "Footing reinforcement size, spacing and cover verified",
      "Column starter bars correctly positioned and plumb",
      "Anti-termite treatment applied where specified",
      "Dewatering adequate; no standing water in the pit",
      "Backfilling material approved and compacted in layers",
    ],
  },
  {
    name: "Superstructure frame",
    description: "Per floor, before and after casting.",
    items: [
      "Formwork line, level and plumb within tolerance",
      "Reinforcement as per structural drawing, with correct laps",
      "Cover blocks in place on all faces",
      "Concrete grade verified; slump test recorded",
      "Cylinder or cube samples taken and labelled",
      "Compaction by vibrator, no honeycombing after stripping",
      "Curing arranged for the full specified duration",
    ],
  },
  {
    name: "Services rough-in",
    description: "Before walls are closed up and plastered.",
    items: [
      "Conduit routes match the electrical layout",
      "No conduits chased through structural members",
      "Plumbing lines pressure-tested and holding",
      "Sanitary slopes and vent positions correct",
      "Earthing continuity verified",
      "Openings and sleeves sealed after testing",
    ],
  },
  {
    name: "Handover",
    description: "Final walkthrough before the last tranche.",
    items: [
      "Snag list from the previous inspection fully cleared",
      "All finishes complete and undamaged",
      "Doors, windows and fittings operate correctly",
      "Water supply, drainage and electrical points all functional",
      "Site cleared of debris and surplus material",
      "As-built drawings and warranties handed over",
    ],
  },
];

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[seed:build] No database connection — set MONGODB_URI first.");
    process.exit(1);
  }

  const rateCount = await BoqRate.countDocuments();
  if (rateCount === 0) {
    await BoqRate.insertMany(BOQ_RATES);
    console.log(`[seed:build] inserted ${BOQ_RATES.length} BOQ rates`);
  } else {
    console.log(`[seed:build] ${rateCount} BOQ rates already present — left alone`);
  }

  const templateCount = await InspectionTemplate.countDocuments();
  if (templateCount === 0) {
    await InspectionTemplate.insertMany(TEMPLATES);
    console.log(`[seed:build] inserted ${TEMPLATES.length} inspection checklists`);
  } else {
    console.log(`[seed:build] ${templateCount} checklists already present — left alone`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed:build] failed:", err);
  process.exit(1);
});
