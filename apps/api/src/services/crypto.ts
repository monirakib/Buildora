/**
 * Field-level encryption and integrity tags.
 *
 * MongoDB Atlas encrypts its disks, which protects against someone walking out
 * with the hardware and nothing else. It does not protect against the realistic
 * failures: a leaked connection string, an over-broad database user, a backup
 * copied somewhere careless, or a compromised admin console. In all of those the
 * attacker gets a normal, readable view of the data.
 *
 * This layer sits above that. The values below are encrypted by the application,
 * with a key the database has never seen, so reading the collection yields
 * ciphertext.
 *
 * **AES-256-GCM**, not AES-CBC, because GCM is authenticated: it produces a tag
 * that makes decryption fail if the ciphertext was altered. Unauthenticated
 * encryption would leave the values confidential but still malleable, and a
 * malleable NID field is a worse problem than a readable one.
 *
 * **Stored format** — four dot-separated parts, so the field stays an ordinary
 * String and no schema surgery is needed:
 *
 *     k1.<iv base64url>.<ciphertext base64url>.<tag base64url>
 *     └─ which key encrypted it
 *
 * Carrying the key id in the value is what lets two keys coexist. Decryption
 * looks up whichever key the value names; encryption always uses the active one.
 * A half-rotated collection is therefore a perfectly valid state, which is what
 * makes the batched rotation in phase 4 safe to interrupt.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env";

const IV_BYTES = 12; // 96 bits, the size GCM is specified and fastest for

/** True when a value is already in the encrypted format above. */
export function isEncrypted(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+$/.test(value)
  );
}

/**
 * Encrypts one field.
 *
 * `aad` is additional authenticated data: it is not stored and not encrypted,
 * but the tag covers it, so decryption only succeeds when the same value is
 * supplied again. Callers pass `<userId>:<fieldName>`, which binds each
 * ciphertext to the row and column it belongs in — lift one user's encrypted
 * NID into another user's document and it will not decrypt. Without this,
 * ciphertext is portable, and someone with write access to the database could
 * assign themselves another person's verified identity without ever reading it.
 */
export function encryptField(plain: string, aad: string): string {
  const version = env.DATA_KEY_ACTIVE;
  const key = env.DATA_KEYS[version];
  if (!key) throw new Error(`No data key for version ${version}`);

  // A fresh random IV per encryption. Reusing an IV under one key is the single
  // catastrophic mistake in GCM — it leaks the XOR of the two plaintexts and
  // the authentication key itself.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    version,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a field. Throws when the value was tampered with, encrypted under a
 * key we no longer hold, or presented with the wrong AAD.
 */
export function decryptField(value: string, aad: string): string {
  const [version, iv, ciphertext, tag] = value.split(".");
  if (!version || !iv || ciphertext === undefined || !tag) {
    throw new Error("Malformed encrypted value");
  }
  const key = env.DATA_KEYS[version];
  if (!key) throw new Error(`No data key for version "${version}" — was it removed too early?`);

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  // `final()` is where a bad tag surfaces — it throws rather than returning
  // wrong plaintext, which is the property CBC would not have given us.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** The key version a stored value was encrypted under. */
export function keyVersionOf(value: string): string | undefined {
  const version = value.split(".")[0];
  return version && env.DATA_KEYS[version] ? version : undefined;
}

/**
 * A **blind index**: a deterministic, keyed digest used where a field must stay
 * searchable after it is encrypted.
 *
 * This is the piece that makes "one NID, one account" survive encryption.
 * AES-GCM uses a random IV, so encrypting one NID twice gives two different
 * ciphertexts — correct for confidentiality, and fatal for a unique index,
 * which would see two unrelated values and happily allow the duplicate. An HMAC
 * of the same input always gives the same output, so uniqueness and equality
 * lookups work exactly as they did on the plaintext.
 *
 * HMAC rather than a plain SHA-256 because the input space is tiny: an NID is
 * ~13 digits, so an unkeyed digest could be reversed by brute force in seconds.
 * The key is what makes that infeasible for someone holding only the database.
 *
 * The trade-off, stated plainly: equal values produce equal indexes, so this
 * does reveal *that* two records share an NID. That is precisely the fact the
 * uniqueness rule needs to know, so it is a cost we are choosing, not one we
 * overlooked.
 */
export function blindIndex(value: string): string {
  return createHmac("sha256", env.BLIND_INDEX_KEY).update(value).digest("hex");
}

/**
 * An integrity tag over a record's important fields.
 *
 * Separate key from the encryption one: a key should do a single job, so that
 * compromising one capability doesn't hand over the other.
 */
export function ledgerTag(canonical: string): { v: string; tag: string } {
  const version = env.LEDGER_KEY_ACTIVE;
  const key = env.LEDGER_KEYS[version];
  if (!key) throw new Error(`No ledger key for version ${version}`);
  return { v: version, tag: createHmac("sha256", key).update(canonical).digest("hex") };
}

/** Constant-time check of a stored tag against the record as it stands now. */
export function ledgerTagMatches(canonical: string, stored: { v?: string; tag?: string }): boolean {
  if (!stored.v || !stored.tag) return false;
  const key = env.LEDGER_KEYS[stored.v];
  if (!key) return false;
  const expected = createHmac("sha256", key).update(canonical).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(stored.tag);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Serialises the protected fields of a record into one unambiguous string.
 *
 * Every part of this is load-bearing. Keys are sorted, so two objects with the
 * same contents in a different order produce the same string — a plain
 * JSON.stringify of a Mongoose document does not guarantee key order, and a tag
 * that changes when nothing changed is an alarm nobody will keep listening to.
 * Values are length-prefixed, so ("ab","c") cannot serialise to the same bytes
 * as ("a","bc") and let someone shift value boundaries without breaking the tag.
 */
export function canonicalize(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .sort()
    .map((key) => {
      const value = fields[key];
      const text =
        value === undefined || value === null
          ? ""
          : value instanceof Date
            ? value.toISOString()
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
      return `${key}:${text.length}:${text}`;
    })
    .join("|");
}
