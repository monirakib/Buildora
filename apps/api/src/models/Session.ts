import { Schema, model, Types, type HydratedDocument } from "mongoose";
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
  /** SHA-256 of the current refresh token's secret. Never the token itself. */
  refreshTokenHash?: string;
  /** The hash this session used before the last refresh — see rotation, below. */
  previousTokenHash?: string;
  /** Which HMAC key signed the current refresh token (for key rotation). */
  refreshKeyVersion?: string;
  /** When the current token replaced the previous one. */
  rotatedAt?: Date;
  /** Address this login started from, and the most recent one it was used from. */
  ipFirst?: string;
  ip?: string;
  /** How many times this session has been used from a different address. */
  ipMismatchCount?: number;
  ipFlaggedAt?: Date;
  /** Hard stop, so expired rows delete themselves instead of piling up. */
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userAgent: { type: String, trim: true, maxlength: 300 },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date },
    refreshTokenHash: { type: String },
    previousTokenHash: { type: String, index: true },
    refreshKeyVersion: { type: String },
    rotatedAt: { type: Date },
    ipFirst: { type: String, trim: true, maxlength: 64 },
    ip: { type: String, trim: true, maxlength: 64 },
    ipMismatchCount: { type: Number, default: 0 },
    ipFlaggedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * Refresh tokens are looked up by hash, so the lookup must be indexed — and
 * unique, because two live logins sharing one token would make rotation
 * ambiguous. Partial rather than plain unique: sessions created before refresh
 * tokens existed have no hash at all, and a plain unique index would treat
 * every one of those as the same missing value and reject all but the first.
 */
sessionSchema.index(
  { refreshTokenHash: 1 },
  { unique: true, partialFilterExpression: { refreshTokenHash: { $type: "string" } } }
);

/**
 * Delete each session once it is past any possible use.
 *
 * `expireAfterSeconds: 0` means "remove when the date in this field passes",
 * which is different from a fixed TTL: each row carries its own deadline. Until
 * now nothing ever removed a session, so every logout and every timeout left a
 * row behind forever — on a 512 MB free-tier cluster that is storage spent on
 * records that can never authenticate anyone again.
 *
 * This is housekeeping, not security. Expiry is enforced by liveSessionFilter
 * on every request; MongoDB's TTL monitor only runs about once a minute, so a
 * row can outlive its date briefly and must never be what a check relies on.
 */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

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

/** When a session started at `from` becomes unusable no matter what. */
export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.SESSION_MAX_HOURS * HOUR_MS);
}

export type TouchResult =
  | { ok: true; session: HydratedDocument<SessionDoc> }
  | { ok: false; reason: "GONE" | "DEVICE_CHANGED" };

/**
 * Checks the login a token came from is still alive, stamps it as seen, and
 * applies the two device bindings. Callers treat any failure as "sign in
 * again"; the reason only changes the message.
 *
 * The two bindings are deliberately different, because the two signals are:
 *
 * **User-Agent is a hard binding, and an opt-in one.** A browser's User-Agent
 * does not change within a session, so a token arriving under a different one
 * is a token that has moved to another machine. That is what a stolen token
 * looks like, so the session is revoked rather than merely refused — refusing
 * once would leave the thief free to retry with the right string. The cost of a
 * false positive is one extra sign-in, e.g. if the browser updates itself
 * mid-session.
 *
 * It is opt-in because "no User-Agent supplied" and "the wrong User-Agent" are
 * not the same thing, and a plain `!==` cannot tell them apart. The Socket.IO
 * handshake deliberately doesn't bind on it (see signaling.ts) and passed no
 * userAgent at all — which compared `undefined` against the stored string,
 * matched, and revoked the session on every socket connection. Callers now say
 * whether to enforce it, so forgetting the field can no longer end a login.
 *
 * **IP is a soft binding: recorded and flagged, never enforced.** Addresses
 * change constantly and innocently here — a phone moving between wifi and
 * mobile data, and carrier-grade NAT giving a whole city one pool. Signing
 * people out for it would break the app for ordinary users on ordinary
 * networks while barely inconveniencing an attacker, who can often source
 * traffic from the same network anyway. So the mismatch is counted and
 * timestamped for the device list to show, and the request proceeds.
 */
export async function touchSession(
  sessionId: string,
  userId: string,
  client: {
    /** Only compared when `bindUserAgent` is set. */
    userAgent?: string;
    ip?: string;
    /**
     * Enforce the User-Agent binding. Off unless asked for, so a caller that
     * doesn't deal in User-Agents can't accidentally revoke a live login.
     */
    bindUserAgent?: boolean;
  }
): Promise<TouchResult> {
  const now = new Date();
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, user: userId, ...liveSessionFilter(now) },
    { $set: { lastSeenAt: now } }
  ).catch(() => null);
  if (!session) return { ok: false, reason: "GONE" };

  if (client.bindUserAgent && session.userAgent && client.userAgent !== session.userAgent) {
    await Session.updateOne({ _id: session._id }, { $set: { revokedAt: now } }).catch(() => null);
    return { ok: false, reason: "DEVICE_CHANGED" };
  }

  // Only written when something actually changed, so the common case stays at
  // the single round trip above.
  if (client.ip && client.ip !== session.ip) {
    const update = session.ipFirst
      ? { $set: { ip: client.ip, ipFlaggedAt: now }, $inc: { ipMismatchCount: 1 } }
      : { $set: { ip: client.ip, ipFirst: client.ip } };
    await Session.updateOne({ _id: session._id }, update).catch(() => null);
  }

  return { ok: true, session };
}
