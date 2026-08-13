import { Schema, model, type Types } from "mongoose";

/**
 * One browser registered for Web Push.
 *
 * A subscription belongs to a *device*, not to a login: the same person on a
 * phone and a laptop has two, and both should buzz. The endpoint is the push
 * service's own URL for that browser and is globally unique, which is why it
 * carries the unique index — re-subscribing the same browser must update the
 * existing row rather than pile up duplicates that each deliver a copy.
 *
 * Subscriptions die on their own: the user clears site data, the browser
 * rotates its registration, or the push service simply drops it. There's no
 * event telling us that happened — we only find out when a send comes back 404
 * or 410, at which point services/webpush.ts deletes the row.
 */
export interface PushSubscriptionDoc {
  user: Types.ObjectId;
  endpoint: string;
  /** Encryption material for this device, straight from the browser. */
  keys: { p256dh: string; auth: string };
  /** Raw User-Agent at subscribe time, turned into a device name by the web app. */
  userAgent?: string;
  /** Last time a push to this endpoint succeeded — powers "last used". */
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, trim: true, maxlength: 300 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

export const PushSubscription = model<PushSubscriptionDoc>(
  "PushSubscription",
  pushSubscriptionSchema
);
