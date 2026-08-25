/**
 * Runs the real estimate path on one project and prints the pricing provenance
 * that came back. Run from apps/api: `pnpm check:estimate [projectId]`.
 *
 * With no id it picks the most recently created project. Calls the same
 * `refreshEstimate` the estimate page calls, so it writes a snapshot exactly as
 * opening that page would — snapshots are append-only history and a new one is
 * the correct result when prices have moved.
 *
 * The point is to prove phase 4 end to end: that the figure an owner sees can be
 * traced back to the individual price rows and the refresh run that produced
 * them, months later, without reconstructing anything.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { Project } from "../models/Project";
import { refreshEstimate } from "../services/estimateLadder";

function bdt(n: number): string {
  return n.toLocaleString("en-US");
}

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[estimate] No database connection, set MONGODB_URI first.");
    process.exit(1);
  }

  const id = process.argv[2];
  const project = id
    ? await Project.findById(id).catch(() => null)
    : await Project.findOne().sort({ createdAt: -1 });

  if (!project) {
    console.error("[estimate] No project found. Post a brief first, or pass an id.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`[estimate] project: ${project.title} (${String(project._id)})`);
  console.log(`[estimate] ${project.landAreaKatha} katha, ${project.floors} floors\n`);

  const result = await refreshEstimate(project);
  if (!result) {
    console.error("[estimate] refreshEstimate returned nothing — is the rate table seeded?");
    await mongoose.disconnect();
    process.exit(1);
  }

  const s = result.snapshot;
  console.log(`tier:      ${s.tier} (${s.areaSource})`);
  console.log(`area:      ${bdt(s.areaSqft)} sqft`);
  console.log(`range:     ${bdt(s.rangeLowBdt)} – ${bdt(s.rangeHighBdt)} BDT`);
  console.log(`midpoint:  ${bdt(s.totalBdt)} BDT (${bdt(s.perSqftBdt)}/sqft)`);
  console.log(`new row:   ${result.isNew ? "yes" : "no, reused the previous snapshot"}`);

  if (!s.pricing) {
    console.log("\nNo pricing provenance on this snapshot.");
    console.log("Expected on the PLOT_ONLY and FLOOR_PLAN tiers only — a BOQ or");
    console.log("bid-backed estimate is priced from real numbers and is not repriced.");
    await mongoose.disconnect();
    return;
  }

  const p = s.pricing;
  console.log(`\n--- pricing provenance (phase 4) ---`);
  console.log(`price version:  ${p.priceRun ? String(p.priceRun) : "(none)"}`);
  console.log(`priced at:      ${p.pricedAt?.toISOString() ?? "(none)"}`);
  console.log(`before -> after: ${bdt(p.originalTotalBdt)} -> ${bdt(s.totalBdt)} BDT`);
  console.log(`lines repriced: ${p.linesRepriced}`);
  console.log(`lines fallback: ${p.linesWithFallback}`);
  console.log(`labour basis:   ${p.labourBasis ?? "(no index point)"}`);
  console.log(`\nprices used (${p.prices.length}):`);

  for (const price of p.prices) {
    console.log(
      `  ${price.itemLabel} @ ${bdt(price.priceBdt)}/${price.unit}` +
        `  [${price.resolution}${price.similarity ? ` ${price.similarity}` : ""}, ${price.ageDays}d]`
    );
    console.log(`      ${price.sourceName}${price.sourceUrl ? ` — ${price.sourceUrl}` : ""}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[estimate] failed:", err);
  process.exit(1);
});
