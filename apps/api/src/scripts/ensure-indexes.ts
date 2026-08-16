/**
 * Builds every model's indexes, once, on purpose.
 *
 * Mongoose builds indexes automatically on connect, which is convenient in
 * development and wrong in production for two reasons. It races the migration:
 * the unique index on `profile.nidKeyBlind` cannot build until `pnpm
 * encrypt:pii` has written those values, so an auto-building deploy fails on a
 * database that is merely mid-migration. And on a free-tier cluster an index
 * build competes with the requests the app is trying to serve.
 *
 * So `autoIndex` is off outside development (see db/mongoose.ts) and this is
 * the deliberate step instead. Run it after a migration, or after adding an
 * index — `pnpm ensure:indexes`.
 *
 * To see what this actually changed — or to check what a database has before
 * touching it — run `pnpm report:indexes`, which compares the schemas against
 * the live indexes without writing anything.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";

// Importing the barrel is what registers every schema and its indexes, and
// `allModels` is the list we walk.
//
// This used to import seven models by hand and then loop over
// `mongoose.modelNames()`. That looks like it covers everything, but
// `modelNames()` only returns models that have actually been imported — so it
// returned those same seven, and the other thirty-four collections never had
// their indexes built. Walking an explicit list makes the coverage visible
// instead of depending on which imports happen to have run.
import { allModels } from "../models";

async function main() {
  if (!(await connectDb())) {
    console.error("[indexes] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }

  let failed = 0;
  for (const model of allModels) {
    try {
      await model.createIndexes();
      console.log(`[indexes] ${model.modelName} ok`);
    } catch (err) {
      failed++;
      // The one that realistically fails is the unique NID index, and the
      // reason is always the same: two accounts claim one identity.
      console.error(
        `[indexes] ${model.modelName} FAILED: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  if (failed > 0) {
    console.error(
      `\n[indexes] ${failed} model(s) failed. A duplicate-key failure on profile.nidKeyBlind ` +
        "means two accounts share an NID — run 'pnpm encrypt:pii' to see which."
    );
  }
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[indexes] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
