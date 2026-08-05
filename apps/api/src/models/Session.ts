import { Schema, model, Types } from "mongoose";
import { env } from "../config/env";

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

const HOUR_MS = 60 * 60 * 1000;

/**
 * The two moments a session has to be newer than to still count: last used
 * within the idle window, and started within the maximum lifetime. Both are
 * derived from fields the session already stores, so there's no expiry date to
 * keep in sync — changing the env vars re-dates every existing session at once.
 */
export function sessionCutoffs(now: Date = new Date()) {
  return {
    usedSince: new Date(now.getTime() - env.SESSION_IDLE_HOURS * HOUR_MS),
    startedSince: new Date(now.getTime() - env.SESSION_MAX_HOURS * HOUR_MS),
  };
}

/**
 * The rule for "this login is still good", as a query filter: not logged out,
 * and inside both windows. Spread into any query that should match live logins.
 */
export function liveSessionFilter(now: Date = new Date()) {
  const { usedSince, startedSince } = sessionCutoffs(now);
  return {
    revokedAt: null,
    lastSeenAt: { $gt: usedSince },
    createdAt: { $gt: startedSince },
  };
}

/**
 * Checks the login a token came from is still alive and stamps it as seen in
 * the same round trip. Returns null when it was logged out, timed out, or the
 * id isn't a real session — every caller treats null as "sign in again".
 */
export async function touchSession(sessionId: string, userId: string) {
  const now = new Date();
  return Session.findOneAndUpdate(
    { _id: sessionId, user: userId, ...liveSessionFilter(now) },
    { $set: { lastSeenAt: now } }
  ).catch(() => null);
}
