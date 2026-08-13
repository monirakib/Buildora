import type { HydratedDocument } from "mongoose";
import {
  NOTIFICATION_EVENTS,
  NotificationType,
  isEmailWorthy,
  isPushWorthy,
  type AppNotification,
} from "@buildora/shared";
import { Notification, type NotificationDoc } from "../models/Notification";
import { User } from "../models/User";
import { emitToUser } from "../realtime/push";
import { sendEmail } from "./email";
import { readPreferences } from "./preferences";
import { pushToUser } from "./webpush";

/**
 * Creating notifications.
 *
 * Every notify* function here is *fire-and-forget on purpose*: a controller
 * calls it after its real work has already been saved, and never awaits a
 * failure. If MongoDB hiccups while writing the bell entry, the order still
 * got placed and the message still got sent — so these swallow their errors
 * rather than turning a successful request into a 500.
 *
 * Each write goes out over three channels, and this is the only place that
 * decides between them:
 *
 *   bell   Socket.IO to the recipient's room — always, and instant, but only
 *          reaches someone with a tab open.
 *   push   Web Push — reaches the browser with every tab closed. Everything
 *          except promotions and missed calls (see isPushWorthy).
 *   email  SMTP from the platform mailbox — reaches someone away from a
 *          computer. Only the significant events (see isEmailWorthy): money,
 *          decisions, commitments.
 *
 * Because every feature in the platform already funnels through here, adding
 * those two channels gave push and email to all of them at once. Nothing
 * downstream had to change.
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
 * Fans one notification out to push and email, honouring both the event type
 * and the recipient's own preferences.
 *
 * Runs detached from the caller: `notify` does not await this, because a slow
 * push service or mail API must never hold up the request that triggered it.
 * Every failure inside is already swallowed by the services themselves.
 */
function deliverOutOfApp(userId: string, input: NotifyInput): void {
  void (async () => {
    try {
      const wantsPush = isPushWorthy(input.type);
      const wantsEmail = isEmailWorthy(input.type);
      if (!wantsPush && !wantsEmail) return;

      // One lookup covers both channels and tells us whether the user opted out.
      // `.lean()` matters: readPreferences explains why a subdocument must never
      // be spread, and lean data sidesteps the problem entirely.
      const user = await User.findById(userId)
        .select("name email emailVerifiedAt notificationPrefs")
        .lean();
      if (!user) return;
      const prefs = readPreferences(user.notificationPrefs);

      if (wantsPush && prefs.push) {
        await pushToUser(userId, {
          title: input.title,
          body: input.body,
          link: input.link,
          // Grouping by type means a second milestone update replaces the first
          // on the lock screen instead of stacking beside it.
          tag: input.type,
        });
      }

      // `emailVerifiedAt` is the hard gate — see services/emailVerification.ts.
      // An address nobody has proved could be a typo or somebody else's inbox,
      // and these messages carry decisions and money.
      if (wantsEmail && prefs.email && user.email && user.emailVerifiedAt) {
        await sendEmail({
          to: user.email,
          toName: user.name,
          subject: input.title,
          text: input.body,
          link: input.link,
          // Colours the pill at the top of the message, so the reader can tell
          // a payment from a meeting before reading a word.
          category: input.type,
        });
      }
    } catch {
      // Best-effort by design — see the note at the top of this file.
    }
  })();
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
    deliverOutOfApp(userId, input);
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
 * How many recipients still counts as transactional mail.
 *
 * Mail from this server is meant for messages caused by one person's action — a
 * decision, a payment, a booking. A platform-wide announcement is a *campaign*,
 * and pushing one through an ordinary mailbox would both burn the provider's
 * daily send limit (Gmail cuts a free account off around 500) and get the
 * address flagged as a bulk sender. Above this size the announcement still
 * reaches everyone by bell and by push, which cost nothing; it just doesn't go
 * out as mail.
 *
 * Fifty comfortably covers the real transactional fan-outs, like telling every
 * supervisor that a verification request came in.
 */
const TRANSACTIONAL_FANOUT_LIMIT = 50;

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

    // Push costs nothing per recipient, so everyone gets it. Email only for
    // genuine transactional fan-outs — see the note on the limit above.
    if (isPushWorthy(input.type)) {
      void pushToManyRespectingPrefs(userIds, input);
    }
    if (isEmailWorthy(input.type)) {
      if (userIds.length <= TRANSACTIONAL_FANOUT_LIMIT) {
        for (const id of userIds) void emailOneRespectingPrefs(id, input);
      } else {
        console.info(
          `[notify] ${userIds.length} recipients — announcement sent by bell and push only, not email`
        );
      }
    }

    return docs.length;
  } catch {
    return 0;
  }
}

/** Pushes to everyone who hasn't turned push off. One query, not one per user. */
async function pushToManyRespectingPrefs(userIds: string[], input: NotifyInput): Promise<void> {
  try {
    // `notificationPrefs.push: { $ne: false }` keeps users who never set a
    // preference, since the default is on.
    const opted = await User.find({
      _id: { $in: userIds },
      "notificationPrefs.push": { $ne: false },
    }).select("_id");

    await Promise.all(
      opted.map((u) =>
        pushToUser(u._id.toString(), {
          title: input.title,
          body: input.body,
          link: input.link,
          tag: input.type,
        })
      )
    );
  } catch {
    // Best-effort.
  }
}

/** Emails one recipient of a fan-out, if they still want email. */
async function emailOneRespectingPrefs(userId: string, input: NotifyInput): Promise<void> {
  try {
    const user = await User.findById(userId)
      .select("name email emailVerifiedAt notificationPrefs")
      .lean();
    if (!user?.email || !user.emailVerifiedAt) return;
    if (!readPreferences(user.notificationPrefs).email) return;
    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: input.title,
      text: input.body,
      link: input.link,
      category: input.type,
    });
  } catch {
    // Best-effort.
  }
}

/** Trims a long body (a cover letter, a chat message) down to a preview line. */
export function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
