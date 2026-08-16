/**
 * Refresh tokens: the long-lived half of a login.
 *
 * The access token (a JWT) is deliberately short-lived now — fifteen minutes —
 * so a stolen one is worth very little. Something has to let a browser keep
 * working for a week without asking for the password again, and that is this:
 * an opaque token the server hands out in an httpOnly cookie, which buys one
 * new access token at a time and is replaced every time it's used.
 *
 * It is **not** a JWT. A JWT carries its own claims and is trusted because it's
 * signed, which is the wrong shape for something that must be revocable — the
 * whole point here is that the server decides, per use, whether this token is
 * still good. So it's a random secret with a database row behind it.
 *
 * The wire format is four dot-separated parts:
 *
 *   v1.<sessionId>.<32 random bytes>.<HMAC-SHA256 over "sessionId.secret">
 *   │   │            │                └─ proves the token was minted by us
 *   │   │            └─ the actual secret; only its SHA-256 is stored
 *   │   └─ which login this is, so we can find the row
 *   └─ which HMAC key signed it, so keys can be rotated (phase 4)
 *
 * **What the HMAC is and isn't for.** It does not make the token unforgeable —
 * 32 random bytes already are; nobody guesses those. It earns its place two
 * other ways. It lets us throw out malformed or foreign tokens with a hash
 * comparison instead of a database round trip, which matters on a free-tier
 * Atlas cluster with a small connection budget. And because the key id travels
 * in the token, retiring a key invalidates every token signed with it at once,
 * with no writes at all.
 *
 * **Only the SHA-256 of the secret is stored.** Anyone who reads the sessions
 * collection — a leaked backup, an over-broad database user — gets hashes they
 * cannot turn back into tokens. This is the same rule the email-verification
 * service already follows for its links.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "../utils/hash";
import { env } from "../config/env";

/** Parts of a token that parsed cleanly and carried a valid signature. */
export interface ParsedRefreshToken {
  keyVersion: string;
  sessionId: string;
  /** SHA-256 of the secret — the form stored on the session document. */
  secretHash: string;
}

function macFor(keyVersion: string, sessionId: string, secret: string): string {
  const key = env.REFRESH_HMAC_KEYS[keyVersion];
  if (!key) throw new Error(`No refresh HMAC key for version ${keyVersion}`);
  return createHmac("sha256", key).update(`${sessionId}.${secret}`).digest("base64url");
}

/**
 * Mints a token for a session. Returns the string to send to the browser and
 * the two values to store — never the secret itself.
 */
export function mintRefreshToken(sessionId: string): {
  token: string;
  secretHash: string;
  keyVersion: string;
} {
  const keyVersion = env.REFRESH_KEY_ACTIVE;
  const secret = randomBytes(32).toString("base64url");
  const mac = macFor(keyVersion, sessionId, secret);
  return {
    token: `${keyVersion}.${sessionId}.${secret}.${mac}`,
    secretHash: sha256Hex(secret),
    keyVersion,
  };
}

/**
 * Checks a token's shape and signature, without touching the database.
 *
 * Returns undefined for anything that isn't ours: wrong number of parts, a key
 * version we no longer hold, or a signature that doesn't match. The caller
 * treats all of those identically — there is nothing useful to tell someone
 * presenting a token we didn't issue.
 */
export function parseRefreshToken(token: string): ParsedRefreshToken | undefined {
  const parts = token.split(".");
  if (parts.length !== 4) return undefined;
  const [keyVersion, sessionId, secret, mac] = parts;
  if (!keyVersion || !sessionId || !secret || !mac) return undefined;
  if (!env.REFRESH_HMAC_KEYS[keyVersion]) return undefined;

  let expected: string;
  try {
    expected = macFor(keyVersion, sessionId, secret);
  } catch {
    return undefined;
  }

  // Compare in constant time. A byte-by-byte comparison that bails on the first
  // difference leaks, through timing, how much of a guessed signature was
  // right — enough to reconstruct one a byte at a time given enough attempts.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  return { keyVersion, sessionId, secretHash: sha256Hex(secret) };
}
