import { Schema, model, Types } from "mongoose";
import { BROADCAST_ALL, NotificationType, UserRole } from "@buildora/shared";

/**
 * An announcement an admin sent from the console — a promo or a system notice.
 *
 * Sending fans the announcement out into one Notification row per recipient
 * (that's what each user actually sees). This document is the campaign record
 * behind that fan-out, kept so the console can show what was sent, to whom, and
 * how many people it reached.
 */
export interface BroadcastDoc {
  type: NotificationType.PROMOTION | NotificationType.SYSTEM;
  title: string;
  body: string;
  link?: string;
  /** A UserRole, or "ALL" for every user on the platform. */
  audience: string;
  /** How many notification rows this send created. */
  recipients: number;
  sentBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastSchema = new Schema<BroadcastDoc>(
  {
    type: {
      type: String,
      enum: [NotificationType.PROMOTION, NotificationType.SYSTEM],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, trim: true, maxlength: 300 },
    audience: { type: String, enum: [BROADCAST_ALL, ...Object.values(UserRole)], required: true },
    recipients: { type: Number, required: true, min: 0 },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// The console lists sends newest first.
broadcastSchema.index({ createdAt: -1 });

export const Broadcast = model<BroadcastDoc>("Broadcast", broadcastSchema);
