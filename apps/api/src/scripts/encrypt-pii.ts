/**
 * One-time migration: encrypts the personal data already sitting in plaintext.
 *
 * Replaces `backfill-nid-keys.ts`, which did the same job for the plaintext
 * canonical key that the blind index has now taken over from.
 *
 * For every account it moves:
 *   profile.nid          → profile.nidEnc     + profile.nidKeyBlind
 *   profile.dateOfBirth  → profile.dateOfBirthEnc
 *   profile.nidCheck     → profile.nidCheckEnc
 *   billing.{mobileWalletNumber,bankAccountNumber,tin} → their *Enc twins
 * and unsets the plaintext originals.
 *
 * **Run this before the new unique index exists.** Uniqueness moved from
 * `profile.nidKey` to `profile.nidKeyBlind`, and MongoDB refuses to build a
 * unique index while duplicates already sit in the collection — so this reports
 * clashes plainly instead of leaving you to read a driver error naming two
 * object ids on the morning of a demo. In production `autoIndex` is off for
 * exactly this reason; `pnpm ensure:indexes` builds them afterwards.
 *
 * Run from apps/api: `pnpm encrypt:pii` (add `--apply` to write; it is a dry
 * run by default). Safe to re-run: an already-encrypted account is skipped, and
 * nothing is ever deleted.
 *
 * Batched with a keyset cursor rather than loading everything: a free-tier
 * instance has 512 MB, and this is the same shape the phase 4 key rotation uses.
 */
import mongoose from "mongoose";
import { nidKeyFor } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { User } from "../models/User";
import { blindIndex, encryptField, isEncrypted } from "../services/crypto";
import { env } from "../config/env";

const BATCH = 100;

/** Plaintext field → the encrypted field it moves into. */
const PROFILE_FIELDS = [
  ["nid", "nidEnc"],
  ["dateOfBirth", "dateOfBirthEnc"],
] as const;
const BILLING_FIELDS = [
  ["mobileWalletNumber", "mobileWalletNumberEnc"],
  ["bankAccountNumber", "bankAccountNumberEnc"],
  ["tin", "tinEnc"],
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const connected = await connectDb();
  if (!connected) {
    console.error("[encrypt] MONGODB_URI is not set, can't run without a database.");
    process.exit(1);
  }
  console.log(
    `[encrypt] ${apply ? "APPLYING" : "dry run"} — active data key "${env.DATA_KEY_ACTIVE}"\n`
  );

  // Raw collection access: the Mongoose schema no longer declares the plaintext
  // fields, so a normal query would strip the very values this has to read.
  const users = mongoose.connection.db!.collection("users");

  let cursor: mongoose.Types.ObjectId | undefined;
  let scanned = 0;
  let changed = 0;
  const blindSeen = new Map<string, string[]>();

  for (;;) {
    const batch = await users
      .find(cursor ? { _id: { $gt: cursor } } : {})
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray();
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!._id as mongoose.Types.ObjectId;

    const writes: Parameters<typeof users.bulkWrite>[0][number][] = [];

    for (const doc of batch) {
      scanned++;
      const userId = String(doc._id);
      const profile = (doc.profile ?? {}) as Record<string, unknown>;
      const billing = (doc.billing ?? {}) as Record<string, unknown>;
      const set: Record<string, unknown> = {};
      const unset: Record<string, ""> = {};

      for (const [plain, sealed] of PROFILE_FIELDS) {
        const value = profile[plain];
        if (typeof value === "string" && value.trim() && !isEncrypted(profile[sealed])) {
          set[`profile.${sealed}`] = encryptField(value, `${userId}:${plain}`);
        }
        if (value !== undefined) unset[`profile.${plain}`] = "";
      }

      // The pre-screen goes in whole — see services/profileCrypto.ts.
      if (profile.nidCheck && typeof profile.nidCheck === "object") {
        set["profile.nidCheckEnc"] = encryptField(
          JSON.stringify(profile.nidCheck),
          `${userId}:nidCheck`
        );
        unset["profile.nidCheck"] = "";
      }

      // The searchable half, derived from the canonical key so a 13-digit
      // number and its 17-digit spelling still collide.
      const rawNid = profile.nid;
      if (typeof rawNid === "string" && rawNid.trim()) {
        const key = nidKeyFor(rawNid);
        if (key) {
          const blind = blindIndex(key);
          set["profile.nidKeyBlind"] = blind;
          blindSeen.set(blind, [...(blindSeen.get(blind) ?? []), `${doc.email} (${userId})`]);
        } else {
          console.warn(`[encrypt] ${doc.email}: NID is not a valid shape, no lookup key written`);
        }
      }
      if (profile.nidKey !== undefined) unset["profile.nidKey"] = "";

      for (const [plain, sealed] of BILLING_FIELDS) {
        const value = billing[plain];
        if (typeof value === "string" && value.trim() && !isEncrypted(billing[sealed])) {
          set[`billing.${sealed}`] = encryptField(value, `${userId}:${plain}`);
        }
        if (value !== undefined) unset[`billing.${plain}`] = "";
      }

      if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) continue;
      if (Object.keys(set).length > 0) set["profile.encV"] = env.DATA_KEY_ACTIVE;
      changed++;
      writes.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            ...(Object.keys(set).length > 0 ? { $set: set } : {}),
            ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
          },
        },
      });
    }

    if (apply && writes.length > 0) await users.bulkWrite(writes);
  }

  // Report clashes rather than guessing. The script cannot know which of two
  // accounts is the real holder of an identity, so that stays a human decision.
  const clashes = [...blindSeen.entries()].filter(([, who]) => who.length > 1);
  console.log(`[encrypt] scanned ${scanned} account(s), ${changed} needed changes.`);
  if (clashes.length > 0) {
    console.error(`\n[encrypt] ${clashes.length} NID(s) claimed by more than one account:`);
    for (const [, who] of clashes) console.error(`  - ${who.join("  vs  ")}`);
    console.error(
      "\n[encrypt] Decide which account keeps the number and clear the NID on the others, " +
        "then run this again. The unique index cannot be built until they are resolved."
    );
  }
  if (!apply) console.log("\n[encrypt] Dry run — nothing was written. Re-run with --apply.");

  await mongoose.disconnect();
  process.exit(clashes.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[encrypt] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
