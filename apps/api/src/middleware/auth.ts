import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@buildora/shared";
import { env } from "../config/env";
import { touchSession } from "../models/Session";

export interface AuthPayload {
  /** User id. */
  sub: string;
  role: UserRole;
  /** Session id — identifies which login this token came from. */
  sid?: string;
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
    payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthPayload;
  } catch {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }

  // The token names the login it came from — make sure that session hasn't
  // been logged out or timed out. The same query bumps lastSeenAt, so the
  // sessions collection doubles as an activity log. (Tokens minted before
  // sessions existed carry no sid and pass through until they expire.)
  if (payload.sid) {
    const session = await touchSession(payload.sid, payload.sub);
    if (!session) {
      return res.status(401).json({ error: { message: "Session expired — please sign in again" } });
    }
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
      const payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthPayload;
      if (payload.sid) {
        const session = await touchSession(payload.sid, payload.sub);
        if (session) req.auth = payload;
      } else {
        req.auth = payload;
      }
    } catch {
      // Invalid/expired token — treat as a guest rather than failing.
    }
  }
  return next();
}
