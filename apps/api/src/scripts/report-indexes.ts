/**
 * Reports which indexes actually exist in the database, and which ones the
 * schemas declare but the database has never been given. Read-only — it never
 * creates, drops, or writes anything. `pnpm report:indexes`.
 *
 * This is the companion to `ensure-indexes.ts`. `autoIndex` is off outside
 * development (see db/mongoose.ts), so outside dev an index exists only if
 * `pnpm ensure:indexes` built it — and until recently that script only
 * registered seven of the forty-one models, so most collections may never have
 * had their indexes built at all. That includes unique indexes that enforce
 * real rules (one bid per contractor per tender, one diary entry per site per
 * day), so "is it actually there?" is worth being able to answer directly
 * rather than assume.
 *
 * Run it before and after `ensure:indexes` — the two outputs are the evidence
 * that the change did something.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { allModels } from "../models";

/**
 * A comparable fingerprint for an index, built from its keys.
 *
 * Comparing by name looks tempting but is fragile: an index created by hand in
 * Atlas can carry any name, while Mongoose derives one from the keys. The keys
 * are what actually determines which queries an index can serve, so that is
 * what we compare on. Order matters and is preserved — `{a:1, b:1}` and
 * `{b:1, a:1}` are genuinely different indexes.
 */
function signature(key: Record<string, unknown>): string {
  return Object.entries(key)
    .map(([field, direction]) => `${field}:${direction}`)
    .join(", ");
}

/** Renders the options that change what an index *means*, for the report. */
function describeOptions(options: Record<string, unknown>): string {
  const notes: string[] = [];
  if (options.unique) notes.push("unique");
  if (options.sparse) notes.push("sparse");
  if (options.partialFilterExpression) notes.push("partial");
  if (options.expireAfterSeconds !== undefined) notes.push(`ttl=${options.expireAfterSeconds}s`);
  return notes.length > 0 ? `  [${notes.join(", ")}]` : "";
}

async function main() {
  // `autoIndex: false` is what keeps this read-only. Importing the barrel above
  // registered all 41 schemas, so connecting in development mode — where
  // autoIndex defaults to true — would have Mongoose build every missing index
  // during connect, and the report would describe a database it had just
  // changed.
  if (!(await connectDb({ autoIndex: false }))) {
    console.error("[report] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) {
    console.error("[report] Connected but no database handle — check the URI has a db name.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // Collection names that already exist. A model whose collection is absent has
  // simply never had a document written to it, which is not a problem — but it
  // does mean its indexes cannot exist yet either, so we report it separately
  // from "the collection is there but the index is missing".
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  let missingTotal = 0;
  let extraTotal = 0;
  let emptyTotal = 0;
  const claimed = new Set<string>();

  console.log(`\n[report] ${allModels.length} models registered.\n`);

  for (const model of allModels) {
    const collectionName = model.collection.collectionName;
    claimed.add(collectionName);

    // What the schema says should exist. `schema.indexes()` covers both
    // `schema.index({...})` calls and field-level `index: true` / `unique: true`
    // declarations. It never includes `_id`, which MongoDB always creates.
    const declared = model.schema.indexes();

    if (!existing.has(collectionName)) {
      emptyTotal++;
      console.log(`${model.modelName} (${collectionName})`);
      console.log(`  collection does not exist yet - ${declared.length} index(es) pending\n`);
      continue;
    }

    const live = await db.collection(collectionName).listIndexes().toArray();
    const liveBySignature = new Map(
      live
        // `_id_` is created automatically and is never declared in a schema, so
        // including it would show up as a false "extra" on every collection.
        .filter((index) => index.name !== "_id_")
        .map((index) => [signature(index.key as Record<string, unknown>), index])
    );

    const declaredSignatures = new Set<string>();
    const lines: string[] = [];

    for (const [key, options] of declared) {
      const sig = signature(key as Record<string, unknown>);
      declaredSignatures.add(sig);
      const found = liveBySignature.get(sig);
      if (found) {
        lines.push(`  ok       ${sig}${describeOptions(options ?? {})}`);
      } else {
        missingTotal++;
        lines.push(`  MISSING  ${sig}${describeOptions(options ?? {})}`);
      }
    }

    // An index in the database that no schema declares. Usually harmless
    // leftovers from a schema that changed — removing `index: true` from a
    // schema does not drop the index from the server — but worth seeing,
    // because every index costs write throughput and storage.
    for (const [sig] of liveBySignature) {
      if (!declaredSignatures.has(sig)) {
        extraTotal++;
        lines.push(`  EXTRA    ${sig}  (in database, not declared in the schema)`);
      }
    }

    console.log(`${model.modelName} (${collectionName})`);
    console.log(lines.length > 0 ? `${lines.join("\n")}\n` : "  no indexes beyond _id\n");
  }

  // A collection with no model behind it means either a leftover from an old
  // schema, or - the case worth catching - a model that was added without being
  // added to models/index.ts.
  const unclaimed = [...existing].filter((name) => !claimed.has(name));

  const stats = await db.stats();
  const indexMb = (stats.indexSize / 1024 / 1024).toFixed(2);
  const dataMb = (stats.dataSize / 1024 / 1024).toFixed(2);

  console.log("-".repeat(60));
  console.log(`models registered      ${allModels.length}`);
  console.log(`indexes missing        ${missingTotal}`);
  console.log(`indexes not declared   ${extraTotal}`);
  console.log(`collections not created yet   ${emptyTotal}`);
  if (unclaimed.length > 0) {
    console.log(`collections with no model    ${unclaimed.join(", ")}`);
    console.log("  ^ if one of these is a real model, it is missing from models/index.ts");
  }
  // The M0 free tier caps at 512 MB total, and indexes count towards it.
  console.log(`data size              ${dataMb} MB`);
  console.log(`index size             ${indexMb} MB   (M0 ceiling is 512 MB total)`);
  if (missingTotal > 0) {
    console.log("\nRun 'pnpm ensure:indexes' to build the missing ones.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[report] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
