/**
 * Every password hash and comparison in the app goes through this module.
 *
 * Passwords are hashed with **argon2id**, which bcrypt is not: bcrypt's inner
 * loop works in about 4 KB of memory, so an attacker can run thousands of
 * guesses in parallel on one GPU. argon2id is *memory-hard* — each guess must
 * hold `ARGON2_MEMORY_KIB` of RAM for its whole duration, so the same GPU can
 * only run as many guesses at once as it has memory for. That is the entire
 * reason for the change.
 *
 * Accounts created before this module existed hold bcrypt hashes. Rather than
 * force everyone to reset their password, `verifyPassword` accepts both and
 * reports whether the stored hash is out of date; the login handler rehashes on
 * the way past. **`bcryptjs` therefore cannot be removed from package.json
 * until every existing account has signed in at least once.**
 *
 * That works because both formats are self-describing. A bcrypt hash starts
 * `$2a$`/`$2b$`, an argon2id hash starts `$argon2id$v=19$m=...,t=...,p=...$`,
 * and each carries its own salt and cost parameters — so the stored string
 * alone says how to verify it, and whether it was made the way we make them now.
 */
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { env } from "../config/env";

/**
 * The `Algorithm.Argon2id` variant, written as its number.
 *
 * The library exports that name as an ambient const enum, which this project's
 * TypeScript config (isolatedModules, required by tsup/tsx) cannot read at all.
 * It is also the library's default, so passing it changes nothing — it is here
 * so the choice of variant is visible in the code rather than inherited.
 *
 * Argon2id rather than Argon2i or Argon2d because it is the hybrid: Argon2d
 * resists GPU cracking but leaks timing through data-dependent memory access,
 * Argon2i is the reverse. Argon2id runs one pass of each and is what RFC 9106
 * and OWASP both name for password storage.
 */
const ARGON2ID = 2;

/**
 * Cost settings, from env so they can be retuned without a code change.
 *
 * The defaults (19 MiB, 2 passes, 1 lane) are OWASP's second recommended
 * argon2id configuration, picked deliberately over the 64 MiB one: this API
 * runs on a 512 MB Render instance, and 19 MiB per concurrent login leaves room
 * for the rest of the process where 64 MiB would not.
 */
const argonOptions = {
  algorithm: ARGON2ID,
  memoryCost: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_TIME_COST,
  parallelism: env.ARGON2_PARALLELISM,
};

/** The parameters baked into an argon2id hash, as it stores them. */
const ARGON_PARAMS = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/;

/** True when a stored argon2id hash was made with the settings we use today. */
function matchesCurrentParams(encoded: string): boolean {
  const found = ARGON_PARAMS.exec(encoded);
  if (!found) return false;
  return (
    Number(found[1]) === env.ARGON2_MEMORY_KIB &&
    Number(found[2]) === env.ARGON2_TIME_COST &&
    Number(found[3]) === env.ARGON2_PARALLELISM
  );
}

/** Hashes a plaintext password for storage. The salt is generated internally. */
export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, argonOptions);
}

/**
 * Checks a password against a stored hash of either format.
 *
 * `needsRehash` is true when the password was right but the stored hash is
 * behind — it's bcrypt, or it's argon2id with parameters we've since raised.
 * Callers that have the plaintext to hand (only the login path does) should
 * rehash and save. It is never true when `ok` is false: without the correct
 * password there is nothing to rehash from.
 */
export async function verifyPassword(
  storedHash: string,
  plain: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith("$2")) {
    const ok = await bcrypt.compare(plain, storedHash);
    return { ok, needsRehash: ok };
  }

  // argonVerify throws on a malformed hash rather than returning false, which
  // would surface as a 500 on a login attempt. A hash we can't parse is a hash
  // this password doesn't match.
  const ok = await argonVerify(storedHash, plain).catch(() => false);
  return { ok, needsRehash: ok && !matchesCurrentParams(storedHash) };
}

/**
 * Burns one password verification's worth of time against a throwaway hash.
 *
 * Login must not answer faster for an unknown username than for a known one
 * with the wrong password — that difference is measurable over a few hundred
 * requests and turns the login form into a "does this account exist?" oracle,
 * regardless of the two paths returning the same message. Calling this on the
 * no-such-user path makes both cost one argon2id verification.
 *
 * The dummy hash is computed once on first use and reused, so the cost is one
 * extra hash per process, not one per request. It is built from random bytes
 * nobody knows, so it can never actually match.
 */
let dummyHash: Promise<string> | undefined;

export async function spendVerifyTime(plain: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(await dummyHash, plain);
}
