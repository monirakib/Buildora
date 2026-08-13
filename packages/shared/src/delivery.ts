import { NotificationType } from "./enums";

/**
 * Getting a notification to someone who isn't looking at the tab.
 *
 * The bell already exists and updates live over Socket.IO, but that only helps
 * a user with Buildora open. These two channels reach further: a Web Push
 * notification wakes the browser even with every tab closed, and an email
 * reaches someone who isn't at a computer at all.
 *
 * Both hang off the same `notify()` chokepoint on the server, so every event
 * the platform already raises gains them at once — no per-feature wiring.
 */

/** What the browser hands us when a user allows notifications. */
export interface PushSubscriptionInput {
  /** The push service URL this browser is reachable at. Unique per device. */
  endpoint: string;
  /** Public key and auth secret, used to encrypt the payload for this device. */
  keys: { p256dh: string; auth: string };
}

/** One registered device, as shown in the account's notification settings. */
export interface PushDevice {
  id: string;
  /** Readable device name derived from the User-Agent, e.g. "Chrome on Windows". */
  label: string;
  /** True for the device making the request — it can't be removed from here. */
  current: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * A user's delivery choices. The in-app bell is always on and isn't listed —
 * turning off your own notification feed inside the app makes no sense.
 */
export interface NotificationPreferences {
  /** Browser push, once at least one device is registered. */
  push: boolean;
  /** Email for the significant events only — see EMAIL_WORTHY below. */
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: true,
};

/**
 * Which events are worth an email.
 *
 * Deliberately not all of them. A chat message, a missed call and a site diary
 * entry are things you check the app for; emailing each one would be spam, and
 * on a free sending tier it would also burn the daily quota on the least
 * important traffic. What's here is money moving, a decision being made about
 * you, or a commitment with a date attached.
 */
export const EMAIL_WORTHY: readonly NotificationType[] = [
  NotificationType.VERIFICATION,
  NotificationType.PROPOSAL,
  NotificationType.CONTRACT,
  NotificationType.PAYMENT,
  NotificationType.ORDER,
  NotificationType.MEETING,
  NotificationType.TENDER,
  NotificationType.BID,
  NotificationType.MILESTONE,
  NotificationType.SYSTEM,
];

/** Whether this kind of event should also go out by email. */
export function isEmailWorthy(type: NotificationType): boolean {
  return EMAIL_WORTHY.includes(type);
}

/**
 * Push, by contrast, carries everything *except* the two that would be
 * actively unhelpful: a marketing message has no business buzzing a phone, and
 * a missed-call notice arrives after the call is already over.
 */
const PUSH_EXCLUDED: readonly NotificationType[] = [
  NotificationType.PROMOTION,
  NotificationType.CALL,
];

export function isPushWorthy(type: NotificationType): boolean {
  return !PUSH_EXCLUDED.includes(type);
}
