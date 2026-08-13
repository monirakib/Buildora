import type { Request, Response } from "express";
import { z } from "zod";
import {
  NotificationType,
  type NotificationPreferences,
  type PushDevice,
} from "@buildora/shared";
import { PushSubscription } from "../models/PushSubscription";
import { User } from "../models/User";
import { getPublicKey, isPushConfigured, pushToUser } from "../services/webpush";
import { isEmailConfigured, sendEmailOrThrow } from "../services/email";
import { readPreferences } from "../services/preferences";

/**
 * Registering browsers for Web Push, and the delivery preferences that decide
 * what actually reaches them.
 *
 * A subscription is per browser, not per login: signing out doesn't unsubscribe
 * (the device is still yours) and signing in on a second machine adds a second
 * one. Both buzz.
 */

/**
 * GET /api/push/config — what the client needs before it can offer push.
 *
 * The public key is safe to hand out; that's the point of it. `pushEnabled`
 * lets the settings UI say "not configured on this server" instead of showing
 * a toggle that silently does nothing.
 */
export function getPushConfig(_req: Request, res: Response) {
  return res.json({
    data: {
      publicKey: getPublicKey() ?? null,
      pushEnabled: isPushConfigured(),
      emailEnabled: isEmailConfigured(),
    },
  });
}

const subscribeSchema = z.object({
  endpoint: z.url("A push endpoint must be a URL"),
  keys: z.object({
    p256dh: z.string().min(1, "Missing the p256dh key"),
    auth: z.string().min(1, "Missing the auth secret"),
  }),
});

/**
 * POST /api/push/subscribe — registers (or refreshes) this browser.
 *
 * Upsert on the endpoint rather than insert: browsers hand back the same
 * endpoint when a page re-subscribes, and a plain insert would either violate
 * the unique index or, worse, create duplicates that each deliver a copy of
 * every notification.
 */
export async function subscribeToPush(req: Request, res: Response) {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid subscription" },
    });
  }

  const { endpoint, keys } = parsed.data;
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      // Reassigns the device if a different person signs in on this browser.
      user: req.auth!.sub,
      endpoint,
      keys,
      userAgent: req.get("user-agent")?.slice(0, 300),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.status(201).json({ data: { subscribed: true } });
}

const unsubscribeSchema = z.object({ endpoint: z.url() });

/** DELETE /api/push/subscribe — this browser opts out. */
export async function unsubscribeFromPush(req: Request, res: Response) {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "An endpoint is required" } });
  }
  // Scoped to the caller so nobody can unsubscribe somebody else's device.
  await PushSubscription.deleteOne({ endpoint: parsed.data.endpoint, user: req.auth!.sub });
  return res.json({ data: { subscribed: false } });
}

/** Turns a raw User-Agent into something a person recognises in a device list. */
function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * GET /api/push/devices — the browsers this account has registered.
 *
 * `current` is matched on the endpoint the caller passes as a query parameter,
 * since the server has no other way to tell which of several devices is asking.
 */
export async function listPushDevices(req: Request, res: Response) {
  const currentEndpoint = String(req.query.endpoint ?? "");
  const subs = await PushSubscription.find({ user: req.auth!.sub }).sort({ createdAt: -1 });

  const devices: PushDevice[] = subs.map((s) => ({
    id: s._id.toString(),
    label: deviceLabel(s.userAgent),
    current: s.endpoint === currentEndpoint,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt?.toISOString(),
  }));

  return res.json({ data: { devices } });
}

/** DELETE /api/push/devices/:id — drop one registered browser. */
export async function removePushDevice(req: Request, res: Response) {
  await PushSubscription.deleteOne({ _id: req.params.id, user: req.auth!.sub });
  return res.json({ data: { removed: true } });
}

const prefsSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
});

/** PATCH /api/push/preferences — turn either out-of-app channel on or off. */
export async function updateNotificationPreferences(req: Request, res: Response) {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Invalid preferences" } });
  }

  const user = await User.findById(req.auth!.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  // readPreferences turns the stored subdocument into plain data first — see
  // the note in services/preferences.ts for why spreading it directly silently
  // reverts to the defaults.
  const next: NotificationPreferences = {
    ...readPreferences(user.notificationPrefs),
    ...parsed.data,
  };
  user.notificationPrefs = next;
  await user.save();

  return res.json({ data: { preferences: next } });
}

/** GET /api/push/preferences — the current choices, defaults filled in. */
export async function getNotificationPreferences(req: Request, res: Response) {
  const user = await User.findById(req.auth!.sub).select("notificationPrefs").lean();
  return res.json({ data: { preferences: readPreferences(user?.notificationPrefs) } });
}

/**
 * POST /api/push/test — sends a push to the caller's own devices.
 *
 * Worth having: push is the one feature where "did that work?" can't be
 * answered by looking at the screen, because the whole point is that it arrives
 * when you aren't looking.
 */
export async function sendTestPush(req: Request, res: Response) {
  if (!isPushConfigured()) {
    return res.status(503).json({
      error: { message: "Push isn't configured on this server" },
    });
  }
  const count = await PushSubscription.countDocuments({ user: req.auth!.sub });
  if (count === 0) {
    return res.status(400).json({
      error: { message: "Turn on notifications in this browser first" },
    });
  }

  await pushToUser(req.auth!.sub, {
    title: "Buildora notifications are on",
    body: "This is what an alert will look like when something needs you.",
    link: "/dashboard",
    tag: NotificationType.SYSTEM,
  });

  return res.json({ data: { sent: count } });
}

/**
 * POST /api/push/test-email — mails the caller's own address.
 *
 * The counterpart of the test push, and useful for the same reason: mail either
 * arrives somewhere else entirely or doesn't arrive at all, and neither answer
 * shows up on screen. This one deliberately reports the SMTP error verbatim —
 * "Invalid login: 535…" is precisely what tells you the app password is wrong,
 * and hiding it behind "couldn't send" would waste an afternoon.
 */
export async function sendTestEmail(req: Request, res: Response) {
  if (!isEmailConfigured()) {
    return res.status(503).json({
      error: { message: "Email isn't configured on this server yet" },
    });
  }

  const user = await User.findById(req.auth!.sub).select("name email emailVerifiedAt").lean();
  if (!user?.email) {
    return res.status(400).json({ error: { message: "Your account has no email address" } });
  }
  // Same rule as every other message: an unproved address gets nothing but the
  // confirmation link itself.
  if (!user.emailVerifiedAt) {
    return res.status(403).json({
      error: { message: "Confirm your email address first — check your account information" },
    });
  }

  try {
    await sendEmailOrThrow({
      to: user.email,
      toName: user.name,
      subject: "Your Buildora emails are working",
      text: "This is a test, sent because you asked for one in your notification settings.\n\nReal ones only go out for the things that matter: a verification decision, money moving in or out of escrow, a booked meeting, a tender or bid, a milestone signed off.",
      link: "/account",
      linkLabel: "Back to settings",
      category: NotificationType.SYSTEM,
    });
  } catch (err) {
    return res.status(502).json({
      error: { message: err instanceof Error ? err.message : "The mail server refused it" },
    });
  }

  return res.json({ data: { sentTo: user.email } });
}
