/**
 * Tamper evidence for the records that move money.
 *
 * Escrow only works if the numbers are trustworthy. Everything else in this
 * codebase defends the *application* — permissions, verification, sealed bids —
 * but none of it applies to someone editing the collection directly through
 * Compass or a leaked connection string. Flipping a milestone to RELEASED or
 * adding a zero to `contractSumBdt` that way leaves no trace at all.
 *
 * This attaches a keyed HMAC over the fields that matter, so an edit made
 * outside the application stops verifying and the next handler that touches the
 * record refuses to move money on it.
 *
 * **Be precise about what this is.** It is tamper *evidence*, not tamper
 * *prevention*, and it defends against exactly one attacker: someone with
 * database access but not the HMAC key. That is a realistic split — the Atlas
 * credential and the key live in different places — but an attacker who has
 * compromised the running application holds the key and can re-sign anything
 * they like. Claiming more than that at a viva is how a design gets picked
 * apart; this is the honest boundary.
 *
 * A second, subtler limit: the pre-save hook re-seals on every legitimate save,
 * so a tampered record that gets saved for an unrelated reason before anyone
 * checks it would be re-sealed with the bad values, erasing the evidence. That
 * is why the money handlers verify *before* they mutate, rather than relying on
 * the tag being checked at some later point.
 */
import type { Schema } from "mongoose";
import { canonicalize, ledgerTag, ledgerTagMatches } from "./crypto";

/** What a record's tag says about it right now. */
export type IntegrityVerdict =
  /** Tag present and matching. */
  | "OK"
  /** Written before integrity tags existed — run `pnpm seal:ledger`. */
  | "UNSEALED"
  /** Tag present and wrong: the stored values are not what we signed. */
  | "TAMPERED";

/** Pulls the protected values out of a document. */
type ProtectedFields = (doc: Record<string, unknown>) => Record<string, unknown>;

export interface LedgerIntegrity {
  v?: string;
  tag?: string;
  at?: Date;
}

/**
 * Adds an `integrity` stamp to a schema and keeps it current on every save.
 *
 * A pre-save hook rather than calls sprinkled through the controllers: hooks
 * cannot be forgotten when somebody adds a new code path a year from now. The
 * gap is that hooks do not fire for `updateOne` / `findOneAndUpdate` / `$inc`,
 * so the few handlers that move money that way re-seal explicitly — see
 * `resealLedger`.
 */
export function protectLedger(schema: Schema, read: ProtectedFields) {
  schema.add({
    integrity: {
      v: { type: String },
      tag: { type: String },
      at: { type: Date },
    },
  });

  // No `next` callback: Mongoose's save hook overloads it with SaveOptions, and
  // the synchronous form is unambiguous.
  schema.pre("save", function () {
    const doc = this as unknown as Record<string, unknown>;
    const { v, tag } = ledgerTag(canonicalize(read(doc)));
    doc.integrity = { v, tag, at: new Date() };
  });

  schema.methods.integrityVerdict = function (): IntegrityVerdict {
    const doc = this as unknown as Record<string, unknown>;
    const stamp = (doc.integrity ?? {}) as LedgerIntegrity;
    if (!stamp.tag) return "UNSEALED";
    return ledgerTagMatches(canonicalize(read(doc)), stamp) ? "OK" : "TAMPERED";
  };
}

/**
 * Mixed into a model's document interface so `integrityVerdict()` is visible to
 * TypeScript. The method itself is attached by `protectLedger`.
 */
export interface LedgerProtected {
  integrity?: LedgerIntegrity;
  integrityVerdict(): IntegrityVerdict;
}

/** A document carrying an integrity stamp. */
export type Sealed = LedgerProtected;

/**
 * Refuses to continue when a record's tag doesn't match what it now holds.
 *
 * Fails **closed**: a record whose numbers were edited outside the application
 * is exactly the record that must not be allowed to release escrow. An
 * `UNSEALED` record is let through with a warning instead, so deploying this
 * doesn't freeze every contract that predates it — `pnpm seal:ledger` clears
 * those, after which the warning is the only thing that ever prints.
 */
export function ledgerProblem(
  doc: Sealed,
  label: string
): { status: number; code: string; message: string } | undefined {
  const verdict = doc.integrityVerdict();
  if (verdict === "TAMPERED") {
    console.error(`[ledger] INTEGRITY FAILURE on ${label} — refusing to move money`);
    return {
      status: 409,
      code: "LEDGER_INTEGRITY",
      message:
        "This record's figures don't match their integrity signature, so it has been frozen. " +
        "Contact a supervisor — this needs to be looked at before any money moves.",
    };
  }
  if (verdict === "UNSEALED") {
    console.warn(`[ledger] ${label} has no integrity tag yet — run 'pnpm seal:ledger'`);
  }
  return undefined;
}
