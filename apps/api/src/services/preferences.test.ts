import { describe, expect, it } from "vitest";
import { Schema, model } from "mongoose";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@buildora/shared";
import { readPreferences } from "./preferences";

/**
 * The bug this file guards against is invisible in review and expensive in
 * practice: because the defaults are "on", a preferences read that silently
 * reverts to them means emailing and push-notifying people who explicitly
 * opted out.
 *
 * The tests below run against a REAL Mongoose subdocument rather than a plain
 * object, because a plain object cannot reproduce the trap — spreading one
 * works fine. It is only the hydrated subdocument, with its internal `$__`
 * properties and its initialised-value getters, that breaks. No database
 * connection is needed: `new Model()` hydrates without ever talking to Mongo.
 */

// Mirrors the notificationPrefs subschema on the User model.
const prefsSchema = new Schema<NotificationPreferences>(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
  },
  { _id: false }
);

const Holder = model(
  "PreferencesTestHolder",
  new Schema({ notificationPrefs: { type: prefsSchema, default: undefined } })
);

/** A hydrated document carrying the given stored choices. */
function stored(prefs: Partial<NotificationPreferences>) {
  return new Holder({ notificationPrefs: prefs }).notificationPrefs;
}

describe("readPreferences", () => {
  it("reads both opt-outs off a real subdocument", () => {
    // The regression that matters. If readPreferences is ever "simplified" into
    // { ...DEFAULTS, ...subdocument }, this comes back { push: true, email: true }
    // and the platform starts mailing people who turned mail off.
    expect(readPreferences(stored({ push: false, email: false }))).toEqual({
      push: false,
      email: false,
    });
  });

  it("keeps one channel off while the other stays on", () => {
    expect(readPreferences(stored({ push: false, email: true }))).toEqual({
      push: false,
      email: true,
    });
    expect(readPreferences(stored({ push: true, email: false }))).toEqual({
      push: true,
      email: false,
    });
  });

  it("reads a plain object too — a .lean() query returns one of those", () => {
    expect(readPreferences({ push: false, email: false })).toEqual({ push: false, email: false });
  });

  it("falls back to the defaults for an account that never chose", () => {
    // `default: undefined` on the schema means an untouched account stores
    // nothing at all, and inherits rather than being written to.
    for (const empty of [undefined, null, {}, "not an object", 42]) {
      expect(readPreferences(empty)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    }
  });

  it("fills in only the missing half of a partial record", () => {
    expect(readPreferences({ email: false })).toEqual({
      push: DEFAULT_NOTIFICATION_PREFERENCES.push,
      email: false,
    });
  });

  it("ignores non-boolean junk rather than treating it as truthy", () => {
    // A stray "false" string must not read as "on".
    expect(readPreferences({ push: "false", email: 0 })).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns a fresh object each time, never a shared default", () => {
    const a = readPreferences(undefined);
    a.email = false;
    // Mutating one caller's result must not turn mail off for everyone else.
    expect(readPreferences(undefined).email).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.email).toBe(true);
  });
});
