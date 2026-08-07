import { Schema, model, Types } from "mongoose";
import { NotificationType } from "@buildora/shared";

/**
 * One notification shown in a user's bell menu.
 *
 * Every row belongs to exactly one recipient — an admin broadcast to 500 users
 * writes 500 rows — so "read" and "dismissed" are naturally per-person and need
 * no join table. `readAt` stays unset until the user opens the bell (or clicks
 * the row); unread counts are simply the rows with no `readAt`.
 */
export interface NotificationDoc {
  /** Who sees this notification. */
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open on click, e.g. "/projects/123". */
  link?: string;
  /** Whoever caused it, when a person did — used for the avatar. */
  actor?: Types.ObjectId;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, trim: true, maxlength: 300 },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date },
  },
  { timestamps: true }
);

// The feed query: "my notifications, newest first".
notificationSchema.index({ user: 1, createdAt: -1 });
// The badge query: "my unread ones". Sparse-ish via the readAt equality match.
notificationSchema.index({ user: 1, readAt: 1 });

export const Notification = model<NotificationDoc>("Notification", notificationSchema);
