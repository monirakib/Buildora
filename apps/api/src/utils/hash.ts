import { createHash } from "node:crypto";

/**
 * The stored form of a bearer secret — an email-confirmation link, a refresh
 * token. **Never store the secret itself.**
 *
 * Anything the server hands out and later recognises can be stored as a hash
 * instead of the value, because recognising it only needs a comparison. That
 * turns a leaked database into a list of useless digests rather than a list of
 * working tokens.
 *
 * Plain SHA-256 with no salt is correct here and would be wrong for a password:
 * these values are 32 bytes of randomness we generated, so there is no
 * dictionary to attack and nothing for a rainbow table to precompute. Salting
 * would also break the lookup, which needs the same input to give the same
 * digest every time.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
