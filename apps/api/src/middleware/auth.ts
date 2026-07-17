import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@buildora/shared";
import { env } from "../config/env";

export interface AuthPayload {
  /** User id. */
  sub: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  try {
    req.auth = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthPayload;
    return next();
  } catch {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }
}

/**
 * Like requireAuth, but anonymous visitors pass through with req.auth unset —
 * for endpoints that work for guests and just do more for signed-in users
 * (e.g. the assistant persists chat history only when it knows who you are).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.auth = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthPayload;
    } catch {
      // Invalid/expired token — treat as a guest rather than failing.
    }
  }
  return next();
}
