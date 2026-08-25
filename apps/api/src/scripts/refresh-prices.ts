/**
 * Runs the weekly price refresh by hand and prints what it did. Run from
 * apps/api: `pnpm refresh:prices`.
 *
 * The same function the cron, the endpoint and the lazy trigger all call — this
 * is just a fourth way in, for when you want to watch it happen. Forced, so it
 * ignores the weekly interval.
 *
 * Read the failed-source list. A parser that broke against a redesigned page is
 * invisible everywhere else, because the estimate carries on perfectly well on
 * the prices it already had.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { runPriceRefresh } from "../services/priceRefresh";

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[refresh] No database connection, set MONGODB_URI first.");
    process.exit(1);
  }

  const run = await runPriceRefresh({ trigger: "ADMIN", force: true });

  if (!run) {
    console.log("[refresh] nothing ran — another refresh is already in flight.");
  } else {
    console.log(`\n[refresh] status:    ${run.status}`);
    console.log(`[refresh] written:   ${run.pricesWritten} price rows`);
    console.log(`[refresh] embedded:  ${run.pricesEmbedded} vectors`);
    console.log(`[refresh] sources ok: ${run.sourcesOk.join(", ") || "(none)"}`);

    for (const f of run.sourcesFailed) {
      console.warn(`[refresh] FAILED  ${f.source}: ${f.reason}`);
    }
    console.log(`[refresh] run id:    ${String(run._id)}  ← the price version`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[refresh] failed:", err);
  process.exit(1);
});
