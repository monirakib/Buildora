import { Schema, model, Types } from "mongoose";

/**
 * One login = one session document. The session id travels inside the JWT
 * (`sid` claim), so requireAuth can check the login it came from is still
 * alive — logging out revokes the session and the token dies with it, even
 * though the JWT itself hasn't expired yet.
 */
export interface SessionDoc {
  user: Types.ObjectId;
  /** Browser/device the login came from, straight from the User-Agent header. */
  userAgent?: string;
  /** Bumped on every authenticated request from this session. */
  lastSeenAt: Date;
  /** Set on logout; a revoked session rejects all further requests. */
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userAgent: { type: String, trim: true, maxlength: 300 },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

export const Session = model<SessionDoc>("Session", sessionSchema);
