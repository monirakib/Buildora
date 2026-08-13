import webpush from "web-push";
import { env } from "../config/env";
import { PushSubscription } from "../models/PushSubscription";

/**
 * Web Push delivery.
 *
 * Push reaches a browser with every Buildora tab closed, which is the one thing
 * the Socket.IO bell cannot do. It needs no third-party service and no account:
 * the browser's own push service (Google's, Mozilla's, Apple's) does the
 * delivery, and VAPID is just a keypair we generate ourselves to prove the
 * messages come from this server.
 *
 * Generate a pair once with:
 *   node -e "console.log(require('web-push').generateVAPIDKeys())"
 * and put them in apps/api/.env. Without them push is simply off — every
 * function here becomes a no-op rather than throwing, the same rule the rest of
 * the optional integrations follow.
 */

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (configured) {
  // The subject must be a mailto: or https: URL identifying the sender; push
  // services reject the request outright without it.
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
} else {
  console.warn("[webpush] VAPID keys not set, browser push is disabled");
}

/** Whether push can be sent at all. The client reads this before offering it. */
export function isPushConfigured(): boolean {
  return configured;
}

/** The public key the browser needs to create a subscription. */
export function getPublicKey(): string | undefined {
  return env.VAPID_PUBLIC_KEY;
}

/** What a pushed notification carries. The service worker reads exactly this. */
export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open when the notification is clicked. */
  link?: string;
  /** Groups related notifications so a later one replaces an earlier one. */
  tag?: string;
}

/**
 * Sends one payload to every device a user has registered.
 *
 * Fire-and-forget, like the rest of the notification path: the caller's real
 * work is already saved, so a push that fails must never surface as an error.
 * Dead subscriptions are pruned as they're discovered — a 404 or 410 from the
 * push service is how it tells us a browser is gone for good, and it is the
 * only signal we get.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configured) return;

  try {
    const subscriptions = await PushSubscription.find({ user: userId });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            body,
            // A push service holds an undelivered message this long, then drops
            // it. A day is right for these: a milestone release is still worth
            // seeing tomorrow morning, but not next week.
            { TTL: 24 * 60 * 60 }
          );
          // Cheap enough to fire and not wait for — it only feeds a timestamp
          // in the device list.
          void PushSubscription.updateOne({ _id: sub._id }, { lastUsedAt: new Date() }).catch(
            () => null
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await PushSubscription.deleteOne({ _id: sub._id }).catch(() => null);
          } else {
            console.error("[webpush] send failed:", status ?? err);
          }
        }
      })
    );
  } catch {
    // Best-effort by design — see the note at the top of this file.
  }
}

/**
 * The same payload to many users at once (the admin broadcast path). Runs the
 * per-user sends in parallel and never rejects.
 */
export async function pushToMany(userIds: string[], payload: PushPayload): Promise<void> {
  if (!configured || userIds.length === 0) return;
  await Promise.all(userIds.map((id) => pushToUser(id, payload)));
}
