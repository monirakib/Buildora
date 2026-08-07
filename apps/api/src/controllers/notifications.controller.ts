import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { NotificationType, type NotificationFeed } from "@buildora/shared";
import { Notification } from "../models/Notification";
import { toNotificationDto } from "../services/notifications";

/** How many notifications the bell loads at once. */
const FEED_LIMIT = 30;

/**
 * GET /api/notifications — the bell's feed: the newest notifications for the
 * caller plus the total unread count (which counts everything, not just this
 * page, so the badge stays right when there are more than FEED_LIMIT).
 *
 * Optional `?type=MESSAGE,CALL` narrows the list — the UI's filter chips each
 * stand for a group of types. Unknown names are ignored rather than rejected.
 * The unread count is deliberately left unfiltered: the badge always means
 * "unread in total", so filtering the list never changes the number.
 */
export async function listNotifications(req: Request, res: Response) {
  const me = req.auth!.sub;

  const typeParam = req.query.type;
  const types =
    typeof typeParam === "string"
      ? typeParam
          .split(",")
          .map((t) => t.trim())
          .filter((t): t is NotificationType =>
            Object.values(NotificationType).includes(t as never)
          )
      : [];

  const filter = types.length > 0 ? { user: me, type: { $in: types } } : { user: me };

  const [docs, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(FEED_LIMIT)
      .populate({ path: "actor", select: "name profile.avatarUrl" }),
    Notification.countDocuments({ user: me, readAt: null }),
  ]);

  const feed: NotificationFeed = { items: docs.map(toNotificationDto), unreadCount };
  return res.json({ data: feed });
}

/** GET /api/notifications/unread-count — just the badge number. */
export async function getUnreadNotificationCount(req: Request, res: Response) {
  const count = await Notification.countDocuments({ user: req.auth!.sub, readAt: null });
  return res.json({ data: { count } });
}

/** POST /api/notifications/:id/read — mark one notification read. */
export async function markNotificationRead(req: Request, res: Response) {
  const { id } = req.params;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Notification not found" } });
  }
  // Scoping the update by `user` is the ownership check: you can only ever
  // touch your own rows, so there's no separate 403 path.
  const result = await Notification.updateOne(
    { _id: id, user: req.auth!.sub, readAt: null },
    { readAt: new Date() }
  );
  if (result.matchedCount === 0) {
    // Either it isn't theirs, or it was already read — both are fine to treat
    // as "nothing to do" rather than an error the UI has to handle.
    const exists = await Notification.exists({ _id: id, user: req.auth!.sub });
    if (!exists) return res.status(404).json({ error: { message: "Notification not found" } });
  }
  return res.json({ data: { ok: true } });
}

/** POST /api/notifications/read-all — clear the badge in one go. */
export async function markAllNotificationsRead(req: Request, res: Response) {
  const result = await Notification.updateMany(
    { user: req.auth!.sub, readAt: null },
    { readAt: new Date() }
  );
  return res.json({ data: { updated: result.modifiedCount } });
}

/** DELETE /api/notifications/:id — dismiss a single notification for good. */
export async function deleteNotification(req: Request, res: Response) {
  const { id } = req.params;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Notification not found" } });
  }
  const result = await Notification.deleteOne({ _id: id, user: req.auth!.sub });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: { message: "Notification not found" } });
  }
  return res.json({ data: { ok: true } });
}

/** DELETE /api/notifications — clear the whole feed. */
export async function clearNotifications(req: Request, res: Response) {
  const result = await Notification.deleteMany({ user: req.auth!.sub });
  return res.json({ data: { deleted: result.deletedCount } });
}
