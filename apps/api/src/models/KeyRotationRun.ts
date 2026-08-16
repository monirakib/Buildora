import { Schema, model, Types } from "mongoose";

/**
 * What a rotation is converting.
 *
 * There is no JWT scope, and that is not an omission. Access tokens live for
 * fifteen minutes and are never stored, so rotating their signing key means
 * adding the new key, making it active, and waiting — every token signed by the
 * old one has expired by itself within the quarter hour. There is nothing to
 * rewrite. `GET /api/keys/status` reports when the old key is safe to remove.
 */
export type RotationScope = "USER_PII" | "LEDGER_HMAC";

export type RotationStatus =
  | "RUNNING"
  /** Interrupted — a restart, or a batch that failed. Resumable from `cursorId`. */
  | "PAUSED"
  /** Every document has been converted; not yet proved. */
  | "COMPLETED"
  /** A completeness sweep found nothing left on an old key. Only now is the old key safe to remove. */
  | "VERIFIED"
  | "FAILED";

/**
 * Per-collection progress, so one run can span several collections.
 *
 * The field is `model`, not `collection`: Mongoose reserves `collection` on a
 * document (it is the collection handle) and warns that using it as a path may
 * break things. Same reason the failure list below is `failures` and not
 * `errors` — `doc.errors` is where Mongoose puts validation errors.
 */
export interface RotationProgress {
  model: string;
  /** Keyset cursor — the last `_id` processed. */
  cursorId?: Types.ObjectId;
  scanned: number;
  rewritten: number;
  done: boolean;
}

export interface KeyRotationRunDoc {
  scope: RotationScope;
  /** The key everything is being moved to. Always the active one. */
  toVersion: string;
  status: RotationStatus;
  progress: RotationProgress[];
  /** Documents that could not be converted. A non-empty list blocks VERIFIED. */
  failures: { model: string; documentId: string; reason: string }[];
  startedBy: Types.ObjectId;
  finishedAt?: Date;
  verifiedAt?: Date;
  /** How many documents were still on an old key at the last verify sweep. */
  outstanding?: number;
  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<RotationProgress>(
  {
    model: { type: String, required: true },
    cursorId: { type: Schema.Types.ObjectId },
    scanned: { type: Number, default: 0 },
    rewritten: { type: Number, default: 0 },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * One key-rotation job, and — the part that matters — its progress.
 *
 * The cursor is persisted rather than held in memory because on a free-tier
 * host the process *will* be interrupted: instances sleep after fifteen minutes
 * idle and restart on every deploy. A rotation that had to complete in one pass
 * would never finish on a large collection. Storing where it got to turns an
 * interruption into a pause.
 *
 * This is only safe because a half-rotated collection is a valid state: every
 * ciphertext and every integrity tag names the key that produced it, so records
 * on the old key and records on the new one both read correctly while the job
 * is part-way through.
 */
const keyRotationRunSchema = new Schema<KeyRotationRunDoc>(
  {
    scope: { type: String, enum: ["USER_PII", "LEDGER_HMAC"], required: true },
    toVersion: { type: String, required: true },
    status: {
      type: String,
      enum: ["RUNNING", "PAUSED", "COMPLETED", "VERIFIED", "FAILED"],
      default: "RUNNING",
      required: true,
    },
    progress: { type: [progressSchema], default: [] },
    failures: {
      type: [
        new Schema(
          {
            model: { type: String, required: true },
            documentId: { type: String, required: true },
            reason: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    finishedAt: { type: Date },
    verifiedAt: { type: Date },
    outstanding: { type: Number },
  },
  { timestamps: true }
);

export const KeyRotationRun = model<KeyRotationRunDoc>("KeyRotationRun", keyRotationRunSchema);
