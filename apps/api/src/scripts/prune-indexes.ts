/**
 * Drops indexes that exist in the database but no schema declares any more.
 *
 * Removing `index: true` from a schema does not remove the index from the
 * server — `createIndexes()` only ever adds. So when a single-field index is
 * replaced by a compound one that starts with the same field, the old index
 * stays behind forever: invisible, and charged for on every write, because
 * every insert and update has to maintain it.
 *
 * A redundant one is genuinely free to drop. MongoDB can use any *prefix* of an
 * index, so `{seller: 1, createdAt: -1}` already answers everything
 * `{seller: 1}` did. What this script must not do is drop an index that is not
 * redundant, so it refuses to touch anything it cannot prove is safe:
 *
 *   - `_id_` is never dropped; MongoDB requires it.
 *   - Anything the schema still declares is never dropped.
 *   - Anything unique, partial, sparse or TTL is never dropped automatically,
 *     even if undeclared. Those carry rules rather than just speed, and losing
 *     one silently would remove a constraint rather than an optimisation.
 *
 * Dry run by default — it prints what it would do and changes nothing. Pass
 * `--yes` to actually drop:
 *
 *   pnpm prune:indexes          # show me
 *   pnpm prune:indexes --yes    # do it
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { allModels } from "../models";

/** Same key fingerprint the report script uses, so the two agree on identity. */
function signature(key: Record<string, unknown>): string {
  return Object.entries(key)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(", ");
}

/**
 * Indexes that do more than speed a query up. Dropping one of these changes what
 * the database allows or expires, so they are never dropped without a human
 * deciding to — the script reports them and moves on.
 */
function carriesARule(index: Record<string, unknown>): boolean {
  return Boolean(
    index.unique || index.partialFilterExpression || index.sparse || index.expireAfterSeconds
  );
}

async function main() {
  const apply = process.argv.includes("--yes");

  // autoIndex off for the same reason report-indexes turns it off: importing the
  // barrel registers every schema, and a development-mode connect would rebuild
  // indexes while we are trying to remove them.
  if (!(await connectDb({ autoIndex: false }))) {
    console.error("[prune] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) {
    console.error("[prune] Connected but no database handle.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  let dropped = 0;
  let skipped = 0;

  for (const model of allModels) {
    const name = model.collection.collectionName;
    if (!existing.has(name)) continue;

    // Written as a loop rather than a .map() so the destructured key keeps the
    // type Mongoose gives it instead of collapsing to implicit `any`.
    const declared = new Set<string>();
    for (const [key] of model.schema.indexes()) {
      declared.add(signature(key as Record<string, unknown>));
    }
    const live = await db.collection(name).listIndexes().toArray();

    for (const index of live) {
      if (index.name === "_id_") continue;
      const sig = signature(index.key as Record<string, unknown>);
      if (declared.has(sig)) continue;

      if (carriesARule(index)) {
        skipped++;
        console.log(
          `[prune] SKIP  ${name}.${index.name}  ` +
            "(unique/partial/sparse/TTL - drop by hand if you mean it)"
        );
        continue;
      }

      if (apply) {
        await db.collection(name).dropIndex(index.name as string);
        dropped++;
        console.log(`[prune] DROP  ${name}.${index.name}  {${sig}}`);
      } else {
        dropped++;
        console.log(`[prune] would drop  ${name}.${index.name}  {${sig}}`);
      }
    }
  }

  const stats = await db.stats();
  console.log("-".repeat(60));
  console.log(`${apply ? "dropped" : "would drop"}   ${dropped}`);
  console.log(`skipped (carry a rule)   ${skipped}`);
  console.log(`index size now           ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
  if (!apply && dropped > 0) {
    console.log("\nDry run — nothing was changed. Re-run with --yes to drop them.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[prune] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
