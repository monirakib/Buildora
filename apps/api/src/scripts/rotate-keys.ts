/**
 * Runs a key rotation from the command line.
 *
 * The same `runRotation` the /api/keys/* endpoints drive, exposed as a script
 * so it can be run from a laptop against Atlas directly. That matters on a free
 * tier: the API instance sleeps after fifteen minutes idle, so "start it
 * through the API and poll" only works if something keeps the instance awake.
 * A long rotation is more reliable driven from outside.
 *
 * Usage, from apps/api:
 *   pnpm rotate:keys status
 *   pnpm rotate:keys run USER_PII
 *   pnpm rotate:keys run LEDGER_HMAC
 *   pnpm rotate:keys verify <runId>
 *
 * The order to rotate a data key safely:
 *   1. Add the new key to DATA_KEYRING, leave DATA_KEY_ACTIVE alone. Redeploy.
 *      Both keys now load; nothing has changed behaviour.
 *   2. Point DATA_KEY_ACTIVE at the new key. Redeploy. New writes use it; old
 *      values still decrypt because each names its own key.
 *   3. `pnpm rotate:keys run USER_PII` — converts everything else.
 *   4. `pnpm rotate:keys verify <runId>` — proves nothing is left behind.
 *   5. Only once that says VERIFIED, remove the old key from DATA_KEYRING.
 *
 * Step 5 is a human editing an environment variable, and deliberately so: this
 * script cannot delete a key, because the API has no write access to its own
 * environment. That is what makes the rollback guarantee structural rather than
 * a matter of remembering the right order.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { env } from "../config/env";
import { KeyRotationRun, type RotationScope } from "../models/KeyRotationRun";
import {
  driveRotation,
  outstandingCount,
  startRotation,
  verifyRotation,
} from "../services/rotation";

async function main() {
  const [command, argument] = process.argv.slice(2);

  if (!(await connectDb())) {
    console.error("[rotate] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }

  if (!command || command === "status") {
    const [pii, ledger] = await Promise.all([
      outstandingCount("USER_PII"),
      outstandingCount("LEDGER_HMAC"),
    ]);
    console.log(`\n  data keys    : ${Object.keys(env.DATA_KEYS).join(", ")}`);
    console.log(`  active       : ${env.DATA_KEY_ACTIVE}`);
    console.log(`  users on old : ${pii}`);
    console.log(`\n  ledger keys  : ${Object.keys(env.LEDGER_KEYS).join(", ")}`);
    console.log(`  active       : ${env.LEDGER_KEY_ACTIVE}`);
    console.log(`  records old  : ${ledger}\n`);
    const runs = await KeyRotationRun.find().sort({ createdAt: -1 }).limit(5);
    for (const run of runs) {
      const done = run.progress.reduce((n, p) => n + p.rewritten, 0);
      console.log(`  ${run._id}  ${run.scope}  ${run.status}  ${done} rewritten`);
    }
    await mongoose.disconnect();
    return;
  }

  if (command === "run") {
    const scope = argument as RotationScope;
    if (scope !== "USER_PII" && scope !== "LEDGER_HMAC") {
      console.error("[rotate] Usage: pnpm rotate:keys run USER_PII|LEDGER_HMAC");
      process.exit(1);
    }
    const outstanding = await outstandingCount(scope);
    if (outstanding === 0) {
      console.error(
        `[rotate] Nothing is on an old key. Add the new key and make it active ` +
          `(${scope === "USER_PII" ? "DATA_KEY_ACTIVE" : "LEDGER_KEY_ACTIVE"}) before rotating.`
      );
      process.exit(1);
    }

    console.log(`[rotate] ${outstanding} record(s) to convert to "${env.DATA_KEY_ACTIVE}"`);
    // startRotation kicks the loop off in the background; await it here so the
    // script stays alive until the sweep finishes.
    const run = await startRotation(scope, "000000000000000000000000");
    await driveRotation(run._id.toString());

    const finished = await KeyRotationRun.findById(run._id);
    const rewritten = finished?.progress.reduce((n, p) => n + p.rewritten, 0) ?? 0;
    console.log(
      `[rotate] ${finished?.status}: ${rewritten} rewritten, ${finished?.failures.length} error(s)`
    );
    for (const e of finished?.failures ?? []) {
      console.error(`  ${e.model}/${e.documentId}: ${e.reason}`);
    }
    console.log(`\n[rotate] Now run:  pnpm rotate:keys verify ${run._id}`);
    await mongoose.disconnect();
    process.exit((finished?.failures.length ?? 0) > 0 ? 1 : 0);
  }

  if (command === "verify") {
    if (!argument) {
      console.error("[rotate] Usage: pnpm rotate:keys verify <runId>");
      process.exit(1);
    }
    const run = await verifyRotation(argument);
    if (!run) {
      console.error("[rotate] No such run.");
      process.exit(1);
    }
    console.log(
      `[rotate] status=${run.status} outstanding=${run.outstanding} errors=${run.failures.length}`
    );
    if (run.status === "VERIFIED") {
      console.log("\n[rotate] VERIFIED — the old key is now safe to remove from the keyring.");
    } else {
      console.error(
        "\n[rotate] NOT verified. Do NOT remove the old key yet: records still reference it, " +
          "and removing it would make them permanently unreadable."
      );
    }
    await mongoose.disconnect();
    process.exit(run.status === "VERIFIED" ? 0 : 1);
  }

  console.error(
    `[rotate] Unknown command "${command}". Try: status | run <scope> | verify <runId>`
  );
  await mongoose.disconnect();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("[rotate] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
