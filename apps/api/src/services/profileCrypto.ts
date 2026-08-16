/**
 * The boundary where a user's sensitive fields become ciphertext and back.
 *
 * Everything above this file — controllers, checks, serialisers — works with
 * plaintext, exactly as before. Everything written to MongoDB below it is
 * encrypted. Two functions do the whole job, `seal` on the way in and `open` on
 * the way out, so there is one place to read to know what is protected.
 *
 * **What is encrypted, and what deliberately isn't.**
 *
 * Encrypted: the NID number, the date of birth, the whole stored pre-screen
 * record (it contains the NID, the name and date of birth read off the card,
 * and the address off the back), and the three financial identifiers — mobile
 * wallet number, bank account number, TIN.
 *
 * Not encrypted, and each for a reason:
 *   - email and username — unique indexes and the login lookup are equality
 *     searches on them, and they are account handles, not secrets.
 *   - phone — shown to the counterparty on every marketplace order anyway.
 *   - addresses, division/district/postcode — the DAP zone checks and delivery
 *     routing read them on ordinary list queries.
 *   - trade licence / BIN / TIN on the *profile* — all indexed, and all printed
 *     on a public trade licence.
 *   - passwordHash — already one-way; encrypting a hash adds nothing.
 *
 * **What this does not protect.** The NID *card images* are Cloudinary URLs
 * that resolve to publicly fetchable files. Encrypting the URL string would
 * look like protection and provide none — anyone who has the link still has the
 * card. Fixing that needs Cloudinary authenticated delivery, which is a
 * separate change; it is called out here so nobody reads this file and
 * concludes the images are covered.
 */
import type { BillingInfo, NidCheck, UserProfile } from "@buildora/shared";
import { nidKeyFor } from "@buildora/shared";
import type { StoredBilling, StoredProfile } from "../models/User";
import { blindIndex, decryptField, encryptField } from "./crypto";
import { env } from "../config/env";

/** Plaintext profile fields that are stored as `<name>Enc` ciphertext. */
const PROFILE_SECRETS = ["nid", "dateOfBirth"] as const;
/** Same, on the billing subdocument. */
const BILLING_SECRETS = ["mobileWalletNumber", "bankAccountNumber", "tin"] as const;

/** Loose shape — the profile is a union of several role-specific types. */
type Bag = Record<string, unknown>;

/**
 * Binds a ciphertext to the exact row and column it belongs in. Passed as GCM's
 * additional authenticated data, so a value copied to another user or another
 * field simply fails to decrypt.
 */
function aad(userId: string, field: string): string {
  return `${userId}:${field}`;
}

function encrypted(name: string): string {
  return `${name}Enc`;
}

/**
 * Encrypts the secrets on a profile, ready to be written.
 *
 * Returns a new object — the caller's is untouched, so a handler can still use
 * the plaintext it built after handing a sealed copy to the database.
 */
export function sealProfile(
  profile: Partial<UserProfile> | Bag | undefined,
  userId: string
): StoredProfile | undefined {
  if (!profile) return undefined;
  const out: Bag = { ...profile };

  for (const field of PROFILE_SECRETS) {
    const value = out[field];
    delete out[field];
    delete out[encrypted(field)];
    if (typeof value === "string" && value.trim()) {
      out[encrypted(field)] = encryptField(value, aad(userId, field));
    }
  }

  // The pre-screen record is sealed whole rather than field by field. Every
  // part of it is either the NID, something transcribed off the card, or a
  // judgement about those, and nothing queries inside it — so one blob is both
  // simpler and strictly more protective than picking fields out.
  const check = out.nidCheck;
  delete out.nidCheck;
  delete out.nidCheckEnc;
  if (check && typeof check === "object") {
    out.nidCheckEnc = encryptField(JSON.stringify(check), aad(userId, "nidCheck"));
  }

  // The searchable half. Derived from the canonical key, not the raw digits, so
  // the same citizen writing 13 digits on one account and 17 on another still
  // collides — which is the whole point of the uniqueness rule.
  delete out.nidKey;
  delete out.nidKeyBlind;
  const nid = (profile as Bag).nid;
  if (typeof nid === "string" && nid.trim()) {
    const key = nidKeyFor(nid);
    if (key) out.nidKeyBlind = blindIndex(key);
  }

  // Recorded separately from the ciphertext so phase 4's "is anything still on
  // the old key?" sweep can use an index instead of scanning every document.
  out.encV = env.DATA_KEY_ACTIVE;

  return out as StoredProfile;
}

/** Encrypts the secrets on a billing subdocument. */
export function sealBilling(
  billing: Partial<BillingInfo> | Bag | undefined,
  userId: string
): StoredBilling | undefined {
  if (!billing) return undefined;
  const out: Bag = { ...billing };
  for (const field of BILLING_SECRETS) {
    const value = out[field];
    delete out[field];
    delete out[encrypted(field)];
    if (typeof value === "string" && value.trim()) {
      out[encrypted(field)] = encryptField(value, aad(userId, field));
    }
  }
  out.encV = env.DATA_KEY_ACTIVE;
  return out;
}

/**
 * One field's plaintext, or undefined if it cannot be read.
 *
 * A failure here is logged and swallowed rather than thrown. If a single
 * ciphertext is damaged — a key retired too early, a partially applied
 * migration — the account page should still load with that one field blank,
 * not return 500 and lock someone out of their own settings.
 */
function open(value: unknown, userId: string, field: string): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return decryptField(value, aad(userId, field));
  } catch (err) {
    console.error(`[crypto] could not decrypt ${field} for user ${userId}:`, err);
    return undefined;
  }
}

/**
 * Decrypts a stored profile back to the shape the rest of the app expects.
 *
 * Values already in plaintext are passed through untouched, so this is safe to
 * run against accounts that predate encryption and during the backfill.
 */
export function openProfile(
  profile: StoredProfile | Bag | undefined,
  userId: string
): UserProfile | undefined {
  if (!profile) return undefined;
  const out: Bag = { ...profile };

  for (const field of PROFILE_SECRETS) {
    const sealed = out[encrypted(field)];
    delete out[encrypted(field)];
    if (sealed !== undefined) {
      const plain = open(sealed, userId, field);
      if (plain !== undefined) out[field] = plain;
    }
  }

  const sealedCheck = out.nidCheckEnc;
  delete out.nidCheckEnc;
  if (sealedCheck !== undefined) {
    const json = open(sealedCheck, userId, "nidCheck");
    if (json) {
      try {
        out.nidCheck = JSON.parse(json) as NidCheck;
      } catch {
        console.error(`[crypto] pre-screen record for user ${userId} is not valid JSON`);
      }
    }
  }

  // Internal bookkeeping — never leaves the server.
  delete out.nidKeyBlind;
  delete out.encV;
  return out as UserProfile;
}

/** Decrypts a stored billing subdocument. */
export function openBilling(
  billing: StoredBilling | Bag | undefined,
  userId: string
): BillingInfo | undefined {
  if (!billing) return undefined;
  const out: Bag = { ...billing };
  for (const field of BILLING_SECRETS) {
    const sealed = out[encrypted(field)];
    delete out[encrypted(field)];
    if (sealed !== undefined) {
      const plain = open(sealed, userId, field);
      if (plain !== undefined) out[field] = plain;
    }
  }
  delete out.encV;
  return out as BillingInfo;
}

/**
 * The value stored in `profile.nidKeyBlind` for a raw NID — what duplicate
 * lookups compare against now that the number itself is unreadable.
 */
export function nidLookupKey(rawNid: string | undefined): string | undefined {
  if (!rawNid) return undefined;
  const key = nidKeyFor(rawNid);
  return key ? blindIndex(key) : undefined;
}
