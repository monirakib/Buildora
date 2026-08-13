import type { NotificationPreferences, PushDevice } from "@buildora/shared";
import { request } from "./api";

/**
 * Browser-side Web Push: registering the service worker, asking permission,
 * and keeping the server's list of devices in step with what this browser
 * actually holds.
 *
 * The awkward part of push is that the browser and the server can disagree.
 * A user can revoke permission in site settings, or clear site data, and
 * neither tells the server. So the source of truth for "is this browser
 * subscribed" is always the browser's own PushManager, read fresh — never a
 * flag we stored.
 */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface PushConfig {
  publicKey: string | null;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

/** GET /api/push/config — the VAPID public key and whether either channel is on. */
export async function getPushConfig(): Promise<PushConfig> {
  const res = await request<{ data: PushConfig }>("/api/push/config");
  return res.data;
}

/**
 * The VAPID key travels as base64url text but `subscribe()` wants raw bytes.
 * Restores the standard-base64 padding and characters, then decodes.
 *
 * The array is built over an explicit ArrayBuffer rather than with
 * `Uint8Array.from`, because the latter is typed over ArrayBufferLike — which
 * may be a SharedArrayBuffer — and `applicationServerKey` only accepts a
 * BufferSource.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Whether this browser can do push at all (Safari on iOS needs installing first). */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The browser's current permission, without prompting. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Registers the worker (idempotent — the browser reuses an existing one). */
async function readyWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** The subscription this browser currently holds, or null. Never cached. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported() || Notification.permission !== "granted") return null;
  try {
    const registration = await readyWorker();
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Asks permission, subscribes, and registers the result with the API.
 *
 * Throws with a readable message on the two refusals worth explaining: the user
 * saying no (which the browser then remembers, so re-asking does nothing) and
 * the server having no VAPID key configured.
 */
export async function enablePush(token: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("This browser doesn't support notifications");
  }

  const config = await getPushConfig();
  if (!config.pushEnabled || !config.publicKey) {
    throw new Error("Push isn't configured on this server yet");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site — allow them in your browser's site settings"
        : "Notifications weren't allowed"
    );
  }

  const registration = await readyWorker();
  // Reuse an existing subscription when there is one; re-subscribing would give
  // the same endpoint anyway, and the server upserts on it.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Chrome refuses a subscription that can't show a visible notification,
      // which is what this flag promises.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    }));

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  await request("/api/push/subscribe", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

/** Unsubscribes this browser and tells the server to forget it. */
export async function disablePush(token: string): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  // Unsubscribe locally first: if the server call fails, the browser has still
  // stopped receiving, and the stale row gets pruned on its next failed send.
  await subscription.unsubscribe().catch(() => null);
  await request("/api/push/subscribe", {
    method: "DELETE",
    headers: authed(token),
    body: JSON.stringify({ endpoint }),
  }).catch(() => null);
}

/** GET /api/push/devices — every browser registered to this account. */
export async function listPushDevices(token: string): Promise<PushDevice[]> {
  const subscription = await currentSubscription();
  const query = subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : "";
  const res = await request<{ data: { devices: PushDevice[] } }>(`/api/push/devices${query}`, {
    headers: authed(token),
  });
  return res.data.devices;
}

/** DELETE /api/push/devices/:id */
export async function removePushDevice(token: string, id: string): Promise<void> {
  await request(`/api/push/devices/${id}`, { method: "DELETE", headers: authed(token) });
}

/** GET /api/push/preferences */
export async function getNotificationPreferences(
  token: string
): Promise<NotificationPreferences> {
  const res = await request<{ data: { preferences: NotificationPreferences } }>(
    "/api/push/preferences",
    { headers: authed(token) }
  );
  return res.data.preferences;
}

/** PATCH /api/push/preferences */
export async function updateNotificationPreferences(
  token: string,
  partial: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const res = await request<{ data: { preferences: NotificationPreferences } }>(
    "/api/push/preferences",
    { method: "PATCH", headers: authed(token), body: JSON.stringify(partial) }
  );
  return res.data.preferences;
}

/** POST /api/push/test — sends a real push to this account's devices. */
export async function sendTestPush(token: string): Promise<number> {
  const res = await request<{ data: { sent: number } }>("/api/push/test", {
    method: "POST",
    headers: authed(token),
  });
  return res.data.sent;
}

/** POST /api/push/test-email — sends a real email to this account's address. */
export async function sendTestEmail(token: string): Promise<string> {
  const res = await request<{ data: { sentTo: string } }>("/api/push/test-email", {
    method: "POST",
    headers: authed(token),
  });
  return res.data.sentTo;
}
