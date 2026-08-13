import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@buildora/shared";

/**
 * Reading a user's notification preferences safely.
 *
 * This exists because of a trap that is easy to fall into and silent when you
 * do: **a Mongoose subdocument cannot be spread**. Writing
 *
 *     { ...DEFAULTS, ...user.notificationPrefs }
 *
 * looks right and is wrong. The spread copies the subdocument's *internal*
 * properties (`$__`, `$__parent`, `_doc`, `$isNew`) and reads its enumerable
 * getters, which hand back the values the document was initialised with rather
 * than the ones currently stored. The result silently reverts to the defaults.
 *
 * That matters more here than almost anywhere else in the codebase: the
 * defaults are "on", so the bug would mean emailing and buzzing people who had
 * explicitly opted out.
 *
 * `toObject()` (or a `.lean()` query) turns it into plain data first, which is
 * what makes the merge behave.
 */
export function readPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  // A hydrated subdocument carries toObject(); a .lean() result is already plain.
  const plain =
    typeof (value as { toObject?: () => unknown }).toObject === "function"
      ? ((value as { toObject: () => unknown }).toObject() as Record<string, unknown>)
      : (value as Record<string, unknown>);

  return {
    push: typeof plain.push === "boolean" ? plain.push : DEFAULT_NOTIFICATION_PREFERENCES.push,
    email: typeof plain.email === "boolean" ? plain.email : DEFAULT_NOTIFICATION_PREFERENCES.email,
  };
}
