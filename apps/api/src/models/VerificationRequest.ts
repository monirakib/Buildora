import { Schema, model, type Types } from "mongoose";
import { VerificationStatus } from "@buildora/shared";

/**
 * A professional's request to be verified. Created when they submit their
 * profile for review; a supervisor (ADMIN) later approves or rejects it, which
 * also updates the user's own `verificationStatus`. The supervisor reviews the
 * professional's live profile, so no credential snapshot is stored here.
 */
export interface VerificationRequestDoc {
  professional: Types.ObjectId;
  /** UNDER_REVIEW until decided, then APPROVED or REJECTED. */
  status: VerificationStatus;
  /** Optional message from the professional to the reviewer. */
  message?: string;
  /** Supervisor's decision note — shown to the professional on rejection. */
  note?: string;
  /**
   * True when the professional bypassed the automated IAB check. The
   * credentials still need checking by hand, so the supervisor is shown this.
   */
  manualReview?: boolean;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationRequestSchema = new Schema<VerificationRequestDoc>(
  {
    professional: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.UNDER_REVIEW,
    },
    message: { type: String, trim: true, maxlength: 1000 },
    note: { type: String, trim: true, maxlength: 1000 },
    manualReview: { type: Boolean, default: false },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * The supervisor's review queue: filter by status, newest-first.
 *
 * `status` had no index at all before this, so the queue — the one screen whose
 * whole job is to filter on it — read every verification request ever made and
 * then sorted them in memory.
 */
verificationRequestSchema.index({ status: 1, createdAt: -1 });

export const VerificationRequest = model<VerificationRequestDoc>(
  "VerificationRequest",
  verificationRequestSchema
);
