import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@buildora/shared";
import { touchSession } from "../models/Session";
import { verifyAccessToken } from "../services/jwt";

// Re-exported so the places that verify a token (the Socket.IO handshake) and
// the place that signs one keep naming the same constants.
export { JWT_AUDIENCE, JWT_ISSUER } from "../services/jwt";

export interface AuthPayload {
  /** User id. */
  sub: string;
  role: UserRole;
  /**
   * Session id — identifies which login this token came from.
   *
   * Required, where it used to be optional. Optional was a real hole: the
   * session check below only ran `if (payload.sid)`, so a token without one
   * skipped it entirely and could not be logged out, timed out, or revoked by
   * an admin. It existed to let tokens minted before sessions kept working;
   * that grace period is long over, and any token missing it now is either
   * ancient or forged. Both should be refused.
   */
  sid: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  let payload: AuthPayload;
  try {
    payload = await verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }
  if (!payload.sid) {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }

  // The token names the login it came from — make sure that session hasn't been
  // logged out or timed out, and that it is still the same device. The same
  // query bumps lastSeenAt, so the sessions collection doubles as an activity
  // log.
  const touched = await touchSession(payload.sid, payload.sub, {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    // Enforced here, and only here plus /auth/refresh: a browser sends the same
    // User-Agent on every request of a session, so a token under a different
    // one has moved to another machine.
    bindUserAgent: true,
  });
  if (!touched.ok) {
    const message =
      touched.reason === "DEVICE_CHANGED"
        ? "This login was ended because it was used from a different device"
        : "Session expired, please sign in again";
    return res.status(401).json({ error: { message } });
  }

  req.auth = payload;
  return next();
}

/**
 * Like requireAuth, but anonymous visitors pass through with req.auth unset —
 * for endpoints that work for guests and just do more for signed-in users
 * (e.g. the assistant persists chat history only when it knows who you are).
 * A revoked session is treated the same as no token: a guest.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = await verifyAccessToken(header.slice("Bearer ".length));
      if (payload.sid) {
        const touched = await touchSession(payload.sid, payload.sub, {
          userAgent: req.headers["user-agent"],
          ip: req.ip,
          bindUserAgent: true,
        });
        if (touched.ok) req.auth = payload;
      }
    } catch {
      // Invalid/expired token — treat as a guest rather than failing.
    }
  }
  return next();
}
