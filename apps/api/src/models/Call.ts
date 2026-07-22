import { Schema, model, Types } from "mongoose";
import { CallStatus } from "@buildora/shared";

/**
 * A 1:1 voice call between two users. The row is created the moment the caller
 * dials and updated as the call progresses, so it doubles as the call history
 * for both sides. The audio itself flows peer-to-peer over WebRTC and never
 * touches the server — only the signaling and this record do.
 */
export interface CallDoc {
  caller: Types.ObjectId;
  callee: Types.ObjectId;
  status: CallStatus;
  /** Set when the callee accepts — used to compute talk time. */
  answeredAt?: Date;
  endedAt?: Date;
  /** Talk time in seconds; 0 for calls that were never answered. */
  durationSec: number;
  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<CallDoc>(
  {
    caller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    callee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: Object.values(CallStatus),
      default: CallStatus.RINGING,
      required: true,
    },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    durationSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// History queries: "my calls, newest first" (as caller or callee).
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });

export const Call = model<CallDoc>("Call", callSchema);
