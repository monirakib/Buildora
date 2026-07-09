import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@buildora/shared";

/** Usage: router.get("/admin-only", requireAuth, requireRole(UserRole.ADMIN), handler) */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: { message: "Authentication required" } });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: { message: "Insufficient permissions" } });
    }
    return next();
  };
}
