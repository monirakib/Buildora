import type { HydratedDocument } from "mongoose";
import { NOTIFICATION_EVENTS, NotificationType, type AppNotification } from "@buildora/shared";
import { Notification, type NotificationDoc } from "../models/Notification";
import { User } from "../models/User";
import { emitToUser } from "../realtime/push";

/**
 * Creating notifications.
 *
 * Every notify* function here is *fire-and-forget on purpose*: a controller
 * calls it after its real work has already been saved, and never awaits a
 * failure. If MongoDB hiccups while writing the bell entry, the order still
 * got placed and the message still got sent — so these swallow their errors
 * rather than turning a successful request into a 500.
 *
 * Each write is also pushed over Socket.IO to the recipient's room, which is
 * what makes the bell update live. If they're offline the push is a no-op and
 * the row is simply waiting for them next time they load a page.
 */

/** Everything a notification needs, minus the recipient. */
export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open on click. */
  link?: string;
  /** The user who caused it, when a person did. */
  actorId?: string;
}

/** Shapes a notification row for the client. `actor` must already be populated. */
export function toNotificationDto(doc: HydratedDocument<NotificationDoc>): AppNotification {
  const actor = doc.actor as unknown as
    { _id: unknown; name: string; profile?: { avatarUrl?: string } } | undefined;
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    // An unpopulated ref is a bare ObjectId with no `name` — treat it as absent
    // rather than shipping a half-built actor to the UI.
    actor: actor?.name
      ? { id: String(actor._id), name: actor.name, avatarUrl: actor.profile?.avatarUrl }
      : undefined,
    readAt: doc.readAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Loads the actor's name/avatar so the pushed DTO can show it right away. */
async function populateActor(doc: HydratedDocument<NotificationDoc>) {
  if (!doc.actor) return doc;
  return doc.populate({ path: "actor", select: "name profile.avatarUrl" });
}

/**
 * Creates one notification and pushes it to the recipient. Never throws — see
 * the note at the top of this file.
 */
export async function notify(userId: string, input: NotifyInput): Promise<void> {
  try {
    const doc = await Notification.create({
      user: userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      actor: input.actorId,
    });
    const populated = await populateActor(doc);
    emitToUser(userId, NOTIFICATION_EVENTS.created, {
      notification: toNotificationDto(populated),
    });
  } catch {
    // Best-effort: the caller's real work is already committed.
  }
}

/**
 * Like `notify`, but for a chat message: instead of stacking one bell entry per
 * message, an existing *unread* notification from the same sender is rewritten
 * with the latest preview and bumped to the top. Ten messages in a row leave one
 * entry, not ten. Once the user reads it, the next message starts a fresh one.
 */
export async function notifyNewMessage(
  recipientId: string,
  senderId: string,
  input: Omit<NotifyInput, "type" | "actorId">
): Promise<void> {
  // Drop the previous unread entry from this sender, then write a fresh one.
  // Replacing rather than editing keeps it simple and puts the new row at the
  // top of the feed for free, since the feed sorts by createdAt.
  await Notification.deleteMany({
    user: recipientId,
    type: NotificationType.MESSAGE,
    actor: senderId,
    readAt: null,
  }).catch(() => null);

  await notify(recipientId, { ...input, type: NotificationType.MESSAGE, actorId: senderId });
}

/**
 * Creates the same notification for many recipients in one insert (the admin
 * broadcast path), then pushes each copy to its owner. Returns how many rows
 * were written so the console can report the reach.
 */
export async function notifyMany(userIds: string[], input: NotifyInput): Promise<number> {
  if (userIds.length === 0) return 0;
  try {
    const docs = await Notification.insertMany(
      userIds.map((user) => ({
        user,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        actor: input.actorId,
      }))
    );

    // The actor is the same person for every copy, so look them up once instead
    // of populating each of (potentially) hundreds of documents.
    const actor = input.actorId
      ? await User.findById(input.actorId).select("name profile.avatarUrl")
      : null;

    for (const doc of docs) {
      emitToUser(String(doc.user), NOTIFICATION_EVENTS.created, {
        notification: {
          id: doc._id.toString(),
          type: doc.type,
          title: doc.title,
          body: doc.body,
          link: doc.link,
          actor: actor
            ? { id: actor._id.toString(), name: actor.name, avatarUrl: actor.profile?.avatarUrl }
            : undefined,
          createdAt: doc.createdAt.toISOString(),
        } satisfies AppNotification,
      });
    }
    return docs.length;
  } catch {
    return 0;
  }
}

/** Trims a long body (a cover letter, a chat message) down to a preview line. */
export function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
