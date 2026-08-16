/**
 * Stamps an integrity tag onto every money record that predates them.
 *
 * Records written before `protectLedger` existed carry no tag, which the money
 * handlers treat as UNSEALED — allowed through with a warning, so deploying the
 * feature doesn't freeze every live contract. This clears those warnings, after
 * which any record without a valid tag is a genuine signal.
 *
 * It also *reports* anything whose tag is present but wrong, and deliberately
 * does not re-seal it: re-signing a record that failed verification would erase
 * the only evidence that something happened to it. Those need a human.
 *
 * Run from apps/api: `pnpm seal:ledger` (dry run) or `pnpm seal:ledger --apply`.
 * Safe to re-run.
 */
import mongoose from "mongoose";
import { connectDb } from "../db/mongoose";
import { BuildContract } from "../models/BuildContract";
import { Contract } from "../models/Contract";
import { Milestone } from "../models/Milestone";
import { PaymentSession } from "../models/PaymentSession";
import { StructuralEngagement } from "../models/StructuralEngagement";
import type { Sealed } from "../services/ledgerIntegrity";

const BATCH = 100;

const COLLECTIONS = [
  ["build contracts", BuildContract],
  ["design contracts", Contract],
  ["milestones", Milestone],
  ["structural engagements", StructuralEngagement],
  ["payment sessions", PaymentSession],
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  if (!(await connectDb())) {
    console.error("[seal] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }
  console.log(`[seal] ${apply ? "APPLYING" : "dry run"}\n`);

  let tampered = 0;

  for (const [label, Model] of COLLECTIONS) {
    let cursor: mongoose.Types.ObjectId | undefined;
    let sealed = 0;
    let ok = 0;
    let bad = 0;

    for (;;) {
      // Keyset pagination, not .skip(): skip is O(n) and an M0 cluster crawls
      // on it. Same shape the phase 4 rotation uses.
      const batch = await (Model as mongoose.Model<unknown>)
        .find(cursor ? { _id: { $gt: cursor } } : {})
        .sort({ _id: 1 })
        .limit(BATCH);
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!._id as mongoose.Types.ObjectId;

      for (const doc of batch) {
        const verdict = (doc as unknown as Sealed).integrityVerdict();
        if (verdict === "OK") {
          ok++;
        } else if (verdict === "TAMPERED") {
          bad++;
          console.error(
            `[seal] ${label}: ${doc._id} FAILS verification — left alone, needs review`
          );
        } else {
          sealed++;
          // The pre-save hook computes the tag; saving is all that's needed.
          if (apply) await (doc as mongoose.Document).save();
        }
      }
    }

    tampered += bad;
    console.log(`[seal] ${label}: ${sealed} to seal, ${ok} already valid, ${bad} failing`);
  }

  if (tampered > 0) {
    console.error(
      `\n[seal] ${tampered} record(s) do not match their tag. They were NOT re-sealed — ` +
        "re-signing them would destroy the evidence. Investigate before doing anything else."
    );
  }
  if (!apply) console.log("\n[seal] Dry run — nothing was written. Re-run with --apply.");

  await mongoose.disconnect();
  process.exit(tampered > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[seal] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
