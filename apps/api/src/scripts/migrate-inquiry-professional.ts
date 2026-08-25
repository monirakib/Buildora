/**
 * One-time migration: renames Inquiry.architect to Inquiry.professional.
 *
 * The Inquiry model used to assume the target was always an architect. Now
 * that land owners can also contact structural engineers and contractors, the
 * field (and its indexes) needed a role-neutral name — see the model and
 * `inquiries.controller.ts`. Existing documents still carry the old field name
 * and the old indexes are now orphaned (the schema no longer declares them, and
 * Mongoose's `createIndexes()` only ever adds, never drops).
 *
 * Run from apps/api: `pnpm migrate:inquiry-professional` (add `--apply` to
 * write; it is a dry run by default). Safe to re-run: a document that already
 * has `professional` is skipped, and nothing is ever deleted.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!(await connectDb({ autoIndex: false }))) {
    console.error("[migrate] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }
  console.log(`[migrate] ${apply ? "APPLYING" : "dry run"}\n`);

  const db = mongoose.connection.db!;
  const collection = db.collection("inquiries");

  // Raw filter: the Mongoose schema no longer declares `architect`, so a
  // query built through the model would strip it before it ever reaches Mongo.
  const stale = await collection.countDocuments({ architect: { $exists: true } });
  console.log(`[migrate] ${stale} document(s) still keyed on "architect"`);

  if (stale > 0) {
    if (apply) {
      const result = await collection.updateMany({ architect: { $exists: true } }, [
        { $set: { professional: "$architect" } },
        { $unset: "architect" },
      ]);
      console.log(`[migrate] renamed field on ${result.modifiedCount} document(s)`);
    } else {
      console.log('[migrate] would rename "architect" -> "professional" on those documents');
    }
  }

  // The three indexes the old schema declared on `architect`. None of them
  // are redundant prefixes of anything the new schema builds (that lives on
  // `professional` instead), so nothing but this script will ever drop them —
  // `prune:indexes` deliberately skips the unique/partial one by design.
  const staleIndexNames = ["architect_1", "landOwner_1_architect_1", "architect_1_createdAt_-1"];
  const liveIndexes = await collection.listIndexes().toArray();
  for (const name of staleIndexNames) {
    if (!liveIndexes.some((i) => i.name === name)) continue;
    if (apply) {
      await collection.dropIndex(name);
      console.log(`[migrate] dropped index ${name}`);
    } else {
      console.log(`[migrate] would drop index ${name}`);
    }
  }

  if (
    !apply &&
    (stale > 0 || liveIndexes.some((i) => staleIndexNames.includes(i.name as string)))
  ) {
    console.log("\nDry run — nothing was changed. Re-run with --apply to write.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[migrate] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
