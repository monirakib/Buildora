/**
 * Key rotation: moving every encrypted field and every integrity tag from an
 * old key to the current one.
 *
 * **The shape of the operation.** Encryption always uses the active key;
 * decryption looks up whichever key the stored value names. So rotation is not
 * a coordinated switchover — it is a sweep that reads each record with whatever
 * key it carries and writes it back with the active one. Records that have been
 * converted and records that have not both work throughout, which is what makes
 * everything below safe to interrupt.
 *
 * **Why it is batched rather than one transaction.** Three reasons, in order of
 * how quickly they bite on this deployment:
 *
 *   1. The host restarts. A free Render instance sleeps after fifteen minutes
 *      idle and restarts on every deploy, so any job that must finish in one
 *      pass eventually never finishes. Progress is persisted per batch, so an
 *      interruption is a pause.
 *   2. Memory. 512 MB total, so the working set has to be bounded — one batch
 *      at a time, never `find()` over a whole collection.
 *   3. Atlas M0 allows 500 connections and modest throughput. A long-running
 *      transaction holding locks across thousands of documents would compete
 *      with the requests the app is trying to serve.
 *
 * A transaction would also buy nothing here. Its guarantee is all-or-nothing,
 * and all-or-nothing is not what we want: a partial rotation is *correct*, and
 * rolling back thousands of successful re-encryptions because document 4,001
 * failed would be strictly worse than stopping and resuming.
 *
 * **Keyset pagination, not `.skip()`.** `skip(n)` makes the server walk and
 * discard n documents every batch, so the job gets quadratically slower as it
 * goes. Sorting by `_id` and asking for `_id > lastSeen` is a single index seek
 * regardless of how far in we are.
 */
import mongoose from "mongoose";
import { env } from "../config/env";
import {
  KeyRotationRun,
  type KeyRotationRunDoc,
  type RotationScope,
} from "../models/KeyRotationRun";
import { BuildContract } from "../models/BuildContract";
import { Contract } from "../models/Contract";
import { Milestone } from "../models/Milestone";
import { PaymentSession } from "../models/PaymentSession";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { User } from "../models/User";
import { decryptField, encryptField } from "./crypto";
import type { Sealed } from "./ledgerIntegrity";

/** Documents per batch. Small enough to bound memory, large enough to be quick. */
const BATCH = 100;

/** The encrypted fields on a user, and the AAD each was sealed with. */
const USER_FIELDS = [
  ["profile.nidEnc", "nid"],
  ["profile.dateOfBirthEnc", "dateOfBirth"],
  ["profile.nidCheckEnc", "nidCheck"],
  ["billing.mobileWalletNumberEnc", "mobileWalletNumber"],
  ["billing.bankAccountNumberEnc", "bankAccountNumber"],
  ["billing.tinEnc", "tin"],
] as const;

const LEDGER_MODELS = [
  ["buildcontracts", BuildContract],
  ["contracts", Contract],
  ["milestones", Milestone],
  ["structuralengagements", StructuralEngagement],
  ["paymentsessions", PaymentSession],
] as const;

/** Only one rotation may run in this process at a time. */
const running = new Set<string>();

/** Reads a dotted path off a plain document. */
function at(doc: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], doc);
}

/**
 * The filter for "not yet on the active key".
 *
 * `$exists` matters: a document that was never encrypted has no version marker
 * at all, and `$ne` alone would match it and send the job looking for fields
 * that aren't there.
 */
function staleUserFilter(active: string) {
  return {
    $or: [
      { "profile.encV": { $exists: true, $ne: active } },
      { "billing.encV": { $exists: true, $ne: active } },
    ],
  };
}

function staleLedgerFilter(active: string) {
  return { "integrity.v": { $exists: true, $ne: active } };
}

/** How many documents are still on an old key, per scope. */
export async function outstandingCount(scope: RotationScope): Promise<number> {
  if (scope === "USER_PII") {
    return User.countDocuments(staleUserFilter(env.DATA_KEY_ACTIVE));
  }
  let total = 0;
  for (const [, Model] of LEDGER_MODELS) {
    total += await (Model as mongoose.Model<unknown>).countDocuments(
      staleLedgerFilter(env.LEDGER_KEY_ACTIVE)
    );
  }
  return total;
}

/** Re-encrypts one batch of users. Returns how many were rewritten. */
async function rotateUserBatch(
  run: KeyRotationRunDoc,
  progress: KeyRotationRunDoc["progress"][number]
) {
  const users = mongoose.connection.db!.collection("users");
  const filter: Record<string, unknown> = staleUserFilter(env.DATA_KEY_ACTIVE);
  if (progress.cursorId) filter._id = { $gt: progress.cursorId };

  const batch = await users.find(filter).sort({ _id: 1 }).limit(BATCH).toArray();
  if (batch.length === 0) {
    progress.done = true;
    return;
  }

  const writes: Parameters<typeof users.bulkWrite>[0][number][] = [];
  for (const doc of batch) {
    progress.scanned++;
    const userId = String(doc._id);
    const set: Record<string, unknown> = {};

    try {
      for (const [path, field] of USER_FIELDS) {
        const value = at(doc as Record<string, unknown>, path);
        if (typeof value !== "string" || !value) continue;
        // Decrypt with whichever key the value names, re-encrypt with the
        // active one. The AAD is unchanged, so the binding to this user and
        // this field survives the rotation.
        const aad = `${userId}:${field}`;
        set[path] = encryptField(decryptField(value, aad), aad);
      }
      if (doc.profile) set["profile.encV"] = env.DATA_KEY_ACTIVE;
      if (doc.billing) set["billing.encV"] = env.DATA_KEY_ACTIVE;
    } catch (err) {
      // Record and carry on. One unreadable document must not stop the sweep —
      // but it does block VERIFIED, so the old key stays put until it is dealt
      // with.
      run.failures.push({
        model: "users",
        documentId: userId,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (Object.keys(set).length > 0) {
      writes.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
      progress.rewritten++;
    }
  }

  if (writes.length > 0) await users.bulkWrite(writes);
  progress.cursorId = batch[batch.length - 1]!._id as mongoose.Types.ObjectId;
}

/** Re-tags one batch of a ledger collection. */
async function rotateLedgerBatch(
  run: KeyRotationRunDoc,
  progress: KeyRotationRunDoc["progress"][number]
) {
  const entry = LEDGER_MODELS.find(([name]) => name === progress.model);
  if (!entry) {
    progress.done = true;
    return;
  }
  const Model = entry[1] as mongoose.Model<unknown>;

  const filter: Record<string, unknown> = staleLedgerFilter(env.LEDGER_KEY_ACTIVE);
  if (progress.cursorId) filter._id = { $gt: progress.cursorId };

  const batch = await Model.find(filter).sort({ _id: 1 }).limit(BATCH);
  if (batch.length === 0) {
    progress.done = true;
    return;
  }

  for (const doc of batch) {
    progress.scanned++;
    // Verify under the OLD key before re-tagging. Re-signing a record that
    // fails verification would launder a tampered row into a valid-looking one
    // — the rotation would destroy exactly the evidence the tags exist for.
    const verdict = (doc as unknown as Sealed).integrityVerdict();
    if (verdict === "TAMPERED") {
      run.failures.push({
        model: progress.model,
        documentId: String((doc as mongoose.Document)._id),
        reason: "integrity check failed under its current key — not re-signed",
      });
      continue;
    }
    // The pre-save hook recomputes the tag with the active key.
    await (doc as mongoose.Document).save();
    progress.rewritten++;
  }

  progress.cursorId = (batch[batch.length - 1] as mongoose.Document)._id as mongoose.Types.ObjectId;
}

/**
 * Drives a run to completion, one batch at a time.
 *
 * Yields to the event loop between batches so the API keeps answering requests
 * while this is going — there is no worker process to put it on.
 */
export async function driveRotation(runId: string): Promise<void> {
  if (running.has(runId)) return;
  running.add(runId);

  try {
    for (;;) {
      const run = await KeyRotationRun.findById(runId);
      if (!run || run.status !== "RUNNING") return;

      const progress = run.progress.find((p) => !p.done);
      if (!progress) {
        run.status = "COMPLETED";
        run.finishedAt = new Date();
        await run.save();
        return;
      }

      try {
        if (run.scope === "USER_PII") await rotateUserBatch(run, progress);
        else await rotateLedgerBatch(run, progress);
      } catch (err) {
        run.status = "PAUSED";
        run.failures.push({
          model: progress.model,
          documentId: "-",
          reason: err instanceof Error ? err.message : String(err),
        });
        await run.save();
        return;
      }

      run.markModified("progress");
      await run.save();
      // Hand the event loop back between batches.
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    running.delete(runId);
  }
}

/** Creates a run and starts it. */
export async function startRotation(scope: RotationScope, startedBy: string) {
  const toVersion = scope === "USER_PII" ? env.DATA_KEY_ACTIVE : env.LEDGER_KEY_ACTIVE;

  const run = await KeyRotationRun.create({
    scope,
    toVersion,
    startedBy,
    status: "RUNNING",
    progress:
      scope === "USER_PII"
        ? [{ model: "users", scanned: 0, rewritten: 0, done: false }]
        : LEDGER_MODELS.map(([name]) => ({
            model: name,
            scanned: 0,
            rewritten: 0,
            done: false,
          })),
  });

  // Deliberately not awaited: the caller gets the run id immediately and polls.
  void driveRotation(run._id.toString());
  return run;
}

/**
 * The completeness sweep — the gate that makes retiring a key safe.
 *
 * A run reaching COMPLETED only means the loop ran out of work, which is not
 * the same as proving nothing is left: a document written while the sweep was
 * behind it, or one skipped by an error, would not be caught. So this asks the
 * database directly, with an indexed count, and only a zero *with no recorded
 * errors* promotes the run to VERIFIED.
 *
 * Nothing here deletes a key, and nothing can: keys live in the environment and
 * the API cannot write its own environment. Retiring one is a human removing a
 * value from the keyring, and VERIFIED is the signal that doing so is safe.
 */
export async function verifyRotation(runId: string) {
  const run = await KeyRotationRun.findById(runId);
  if (!run) return undefined;

  const outstanding = await outstandingCount(run.scope);
  run.outstanding = outstanding;

  if (outstanding === 0 && run.failures.length === 0 && run.status === "COMPLETED") {
    run.status = "VERIFIED";
    run.verifiedAt = new Date();
  }
  await run.save();
  return run;
}
