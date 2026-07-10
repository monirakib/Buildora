/**
 * Loads starter permit reference data — DAP zones, RAJUK fee rates, and ECPS
 * process steps — so the permit tools have something to show on a fresh
 * database. Run from apps/api: `pnpm seed:permits`. Safe to re-run: it only
 * inserts into collections that are still empty, so admin edits are never
 * overwritten. The figures are representative starter values; admins maintain
 * the real ones from /admin/permits.
 */
import mongoose from "mongoose";
import { LandUse } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { DapZone } from "../models/DapZone";
import { EcpsStep } from "../models/EcpsStep";
import { FeeRule } from "../models/FeeRule";

const DAP_ZONES = [
  {
    areaName: "Dhanmondi",
    zoneCode: "DAP-DHN-01",
    landUse: LandUse.RESIDENTIAL,
    maxFar: 3.5,
    maxGroundCoveragePct: 62.5,
    maxFloors: 8,
    notes: "Planned residential area; wider roads allow higher FAR on plots over 5 katha.",
  },
  {
    areaName: "Gulshan",
    zoneCode: "DAP-GUL-02",
    landUse: LandUse.RESIDENTIAL,
    maxFar: 4.0,
    maxGroundCoveragePct: 60,
    maxFloors: 10,
    notes: "Diplomatic zone restrictions apply on some avenues.",
  },
  {
    areaName: "Banani",
    zoneCode: "DAP-BAN-03",
    landUse: LandUse.MIXED_USE,
    maxFar: 4.5,
    maxGroundCoveragePct: 60,
    maxFloors: 12,
    notes: "Commercial frontage permitted on main roads.",
  },
  {
    areaName: "Motijheel",
    zoneCode: "DAP-MTJ-04",
    landUse: LandUse.COMMERCIAL,
    maxFar: 6.0,
    maxGroundCoveragePct: 65,
    maxFloors: 20,
    notes: "Central business district.",
  },
  {
    areaName: "Uttara",
    zoneCode: "DAP-UTT-05",
    landUse: LandUse.RESIDENTIAL,
    maxFar: 3.15,
    maxGroundCoveragePct: 60,
    maxFloors: 7,
    notes: "Sector-wise plot rules; corner plots get relaxations.",
  },
  {
    areaName: "Mirpur",
    zoneCode: "DAP-MIR-06",
    landUse: LandUse.RESIDENTIAL,
    maxFar: 3.0,
    maxGroundCoveragePct: 62.5,
    maxFloors: 6,
    notes: "",
  },
  {
    areaName: "Tejgaon",
    zoneCode: "DAP-TEJ-07",
    landUse: LandUse.INDUSTRIAL,
    maxFar: 5.0,
    maxGroundCoveragePct: 70,
    maxFloors: 14,
    notes: "Industrial-to-commercial conversion area.",
  },
  {
    areaName: "Bashundhara",
    zoneCode: "DAP-BAS-08",
    landUse: LandUse.MIXED_USE,
    maxFar: 4.0,
    maxGroundCoveragePct: 60,
    maxFloors: 10,
    notes: "",
  },
];

const FEE_RULES = [
  {
    category: LandUse.RESIDENTIAL,
    label: "Residential building",
    baseFeeBdt: 10000,
    ratePerSqmBdt: 120,
    notes: "Per sq.m of proposed floor area.",
  },
  {
    category: LandUse.COMMERCIAL,
    label: "Commercial building",
    baseFeeBdt: 25000,
    ratePerSqmBdt: 250,
    notes: "",
  },
  {
    category: LandUse.MIXED_USE,
    label: "Mixed-use building",
    baseFeeBdt: 20000,
    ratePerSqmBdt: 200,
    notes: "",
  },
  {
    category: LandUse.INDUSTRIAL,
    label: "Industrial building",
    baseFeeBdt: 30000,
    ratePerSqmBdt: 180,
    notes: "",
  },
  {
    category: LandUse.INSTITUTIONAL,
    label: "Institutional building",
    baseFeeBdt: 15000,
    ratePerSqmBdt: 150,
    notes: "Schools, hospitals, community facilities.",
  },
];

const ECPS_STEPS = [
  {
    order: 1,
    title: "Land Use Clearance (LUC)",
    description:
      "Apply on the ECPS portal for a Land Use Clearance confirming what the DAP allows on your plot. This is the entry point of every RAJUK permit.",
    requiredDocuments: [
      "Ownership deed / mutation papers",
      "Digital survey (porcha) map",
      "NID of the owner",
    ],
  },
  {
    order: 2,
    title: "Prepare drawings & documents",
    description:
      "Your architect and structural engineer prepare the architectural and structural drawings that match the LUC conditions, signed by registered professionals.",
    requiredDocuments: [
      "Architectural drawings (IAB-registered architect)",
      "Structural drawings (IEB-registered engineer)",
      "Soil test report",
    ],
  },
  {
    order: 3,
    title: "Construction Permit application",
    description:
      "Submit the full Construction Permit (CP) application on ECPS with all drawings, professional registrations, and the LUC reference, then pay the permit fee.",
    requiredDocuments: ["LUC reference number", "All signed drawings", "Fee payment receipt"],
  },
  {
    order: 4,
    title: "RAJUK scrutiny & objections",
    description:
      "RAJUK reviews the application. Respond to any objection (shunani) with corrected drawings or documents until the file is cleared for approval.",
    requiredDocuments: ["Objection responses (if raised)"],
  },
  {
    order: 5,
    title: "Construction Permit issued",
    description:
      "The approved permit is issued on ECPS. Construction may begin; keep the permit displayed at the site and follow the approved drawings.",
    requiredDocuments: [],
  },
  {
    order: 6,
    title: "Occupancy Certificate",
    description:
      "After construction, apply for the Occupancy Certificate confirming the building matches the approved design and is safe to occupy.",
    requiredDocuments: ["Completion report from the engineer", "As-built drawings (if changed)"],
  },
];

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[seed] MONGODB_URI is not set — can't seed without a database.");
    process.exit(1);
  }

  if ((await DapZone.countDocuments()) === 0) {
    await DapZone.insertMany(DAP_ZONES);
    console.log(`[seed] Inserted ${DAP_ZONES.length} DAP zones`);
  } else {
    console.log("[seed] DAP zones already present — skipped");
  }

  if ((await FeeRule.countDocuments()) === 0) {
    await FeeRule.insertMany(FEE_RULES);
    console.log(`[seed] Inserted ${FEE_RULES.length} fee rules`);
  } else {
    console.log("[seed] Fee rules already present — skipped");
  }

  if ((await EcpsStep.countDocuments()) === 0) {
    await EcpsStep.insertMany(ECPS_STEPS);
    console.log(`[seed] Inserted ${ECPS_STEPS.length} ECPS steps`);
  } else {
    console.log("[seed] ECPS steps already present — skipped");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
