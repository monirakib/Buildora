import type { NextFunction, Request, Response } from "express";
import { VerificationStatus } from "@buildora/shared";
import { User } from "../models/User";

/**
 * Refuses an action because the person taking it hasn't been verified.
 *
 * Usage: router.post("/", requireAuth, requireRole(UserRole.LAND_OWNER), requireVerified, handler)
 *
 * Two things about this are worth understanding before changing it.
 *
 * **It reads the database, not the token.** The JWT carries only the user id,
 * their role and the session id — verification status isn't in it, and putting
 * it there would mean a token minted before approval kept saying "unverified"
 * until it expired. One extra indexed lookup per gated write is the price of
 * a badge that takes effect the moment a supervisor grants it.
 *
 * **It only ever guards writes.** Every GET stays open: an unverified user is
 * meant to be able to look around the whole platform and see exactly what
 * they're missing out on. The rule is "you can see it, you can't do it".
 */
export async function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }

  const user = await User.findById(req.auth.sub).select("verificationStatus");
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  if (user.verificationStatus !== VerificationStatus.APPROVED) {
    // The status travels with the refusal so the web app can say something
    // useful — "finish your documents" and "a supervisor is still reading them"
    // are very different messages to the person waiting.
    return res.status(403).json({
      error: {
        code: "NOT_VERIFIED",
        status: user.verificationStatus,
        message: messageFor(user.verificationStatus),
      },
    });
  }

  return next();
}

function messageFor(status: VerificationStatus): string {
  switch (status) {
    case VerificationStatus.DOCUMENTS_SUBMITTED:
    case VerificationStatus.UNDER_REVIEW:
      return "Your documents are with a supervisor. You'll be able to do this once they're approved.";
    case VerificationStatus.REJECTED:
      return "Your verification wasn't approved. Update your documents and submit them again.";
    default:
      return "Verify your account before doing this — it takes a few minutes and a supervisor reviews it.";
  }
}
