/**
 * Shows what live prices are doing to every BOQ rate, and why. Run from
 * apps/api: `pnpm check:repricing`.
 *
 * **Writes nothing.** It prices a nominal 1000 sqft against the current rate
 * table, runs the real retrieval and repricing path, and prints the working —
 * so you can see which slice of which rate moved, which price moved it, how that
 * price was found and how old it was. No project is touched and no snapshot is
 * created.
 *
 * This is the script to run when a figure looks wrong. "The estimate went up 4%"
 * is not debuggable; "the cement slice of RCC moved 1.07 because a marketplace
 * median 2 days old came in at 540 against a 505 baseline" is.
 */
import mongoose from "mongoose";
import type { CostLine } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { BoqRate } from "../models/BoqRate";
import { loadRepricingContext, repriceLine } from "../services/repricing";

/** A round number, so the per-rate arithmetic is easy to follow by eye. */
const SAMPLE_SQFT = 1000;

function bdt(n: number): string {
  return n.toLocaleString("en-US");
}

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[repricing] No database connection, set MONGODB_URI first.");
    process.exit(1);
  }

  const rates = await BoqRate.find({ active: true }).sort({ order: 1, category: 1 });
  if (rates.length === 0) {
    console.error("[repricing] No BOQ rates — run `pnpm seed:build` first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const context = await loadRepricingContext();
  console.log(`[repricing] ${context.compositions.size} compositions loaded`);
  console.log(
    `[repricing] price candidates by category: ` +
      [...context.candidates.entries()].map(([c, list]) => `${c}=${list.length}`).join(" ")
  );
  console.log(
    `[repricing] labour index: ` +
      (context.labour.basis
        ? `${context.labour.factor.toFixed(3)} over ${context.labour.basis}`
        : "no index point yet, wages unadjusted")
  );

  const lines: CostLine[] = rates.map((rate) => {
    const quantity = Math.round(rate.quantityPerSqft * SAMPLE_SQFT * 100) / 100;
    return {
      description: rate.description,
      category: rate.category,
      unit: rate.unit,
      quantity,
      ratePerUnitBdt: rate.ratePerUnitBdt,
      totalBdt: Math.round(quantity * rate.ratePerUnitBdt),
    };
  });

  let before = 0;
  let after = 0;
  let moved = 0;

  console.log(`\n=== ${SAMPLE_SQFT} sqft, every active rate ===\n`);

  for (const line of lines) {
    const result = repriceLine(
      line,
      context.compositions.get(line.description),
      context.candidates,
      context.labour
    );

    before += result.originalRatePerUnitBdt * line.quantity;
    after += result.line.ratePerUnitBdt * line.quantity;

    const changed = result.line.ratePerUnitBdt !== result.originalRatePerUnitBdt;
    if (changed) moved += 1;

    const pct = result.originalRatePerUnitBdt
      ? ((result.line.ratePerUnitBdt - result.originalRatePerUnitBdt) /
          result.originalRatePerUnitBdt) *
        100
      : 0;

    console.log(
      `${changed ? "*" : " "} ${line.description}\n` +
        `    ${bdt(result.originalRatePerUnitBdt)} -> ${bdt(result.line.ratePerUnitBdt)} ${line.unit}` +
        `${changed ? `  (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : "  (unchanged)"}` +
        `${result.usedFallback ? "  [FALLBACK]" : ""}`
    );

    for (const a of result.adjustments) {
      const share = `${(a.fraction * 100).toFixed(0)}%`;
      if (a.skippedReason) {
        console.log(`      ${share.padStart(4)} ${a.label} — ${a.skippedReason}`);
        continue;
      }
      const via = a.price
        ? `${a.price.itemLabel} @ ${bdt(a.price.priceBdt)}/${a.price.unit}` +
          ` (${a.price.resolution}${a.price.similarity ? ` ${a.price.similarity}` : ""}, ${a.price.ageDays}d, ${a.price.sourceName})`
        : "index";
      console.log(`      ${share.padStart(4)} ${a.label} x${a.factor.toFixed(3)} — ${via}`);
    }
    console.log("");
  }

  const totalPct = before ? ((after - before) / before) * 100 : 0;
  console.log(`=== ${moved}/${lines.length} rates moved ===`);
  console.log(
    `total ${bdt(Math.round(before))} -> ${bdt(Math.round(after))} BDT ` +
      `(${totalPct > 0 ? "+" : ""}${totalPct.toFixed(2)}%)`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[repricing] failed:", err);
  process.exit(1);
});
