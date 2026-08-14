import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "./rateLimit";

/**
 * Rate limits for everything that costs a model call.
 *
 * Both providers are free tiers with a daily ceiling, so the thing being
 * protected here isn't the server — it's the quota. Without these, one person
 * holding down a send button can spend the whole day's budget before anyone
 * else gets to try the feature.
 *
 * These are module-level constants on purpose. Every route that mounts
 * aiInlineLimit shares one bucket, so a user gets one budget for AI help across
 * the whole site rather than a fresh six per page.
 */

/**
 * One bucket per signed-in person, falling back to IP for guests. requireAuth
 * (or optionalAuth) has to run before the limiter for this to see req.auth —
 * mounted the other way round it silently degrades to IP for everyone.
 */
const byUser = (req: Request) => req.auth?.sub ?? req.ip ?? "unknown";

/** The assistant chat, for signed-in users. Generous enough for real use. */
export const aiChatLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyBy: byUser,
  message: "You're asking a lot at once, give it a minute",
});

/**
 * Guests on the landing page. Tighter, and keyed by IP because there is no user
 * to key on — a signed-out visitor has no account to spend.
 */
export const aiGuestLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: "You're asking a lot at once, sign in or give it a minute",
});

/**
 * The inline helpers (brief coach, bid check, proposal draft, diary digest).
 * Each is one deliberate button press, so a low ceiling is plenty and anything
 * above it is a stuck finger or a script.
 */
export const aiInlineLimit = rateLimit({
  windowMs: 60_000,
  max: 6,
  keyBy: byUser,
  message: "That's a lot of AI help in one minute, give it a moment",
});

/**
 * The chat endpoint answers both guests and signed-in users, so it picks the
 * bucket per request rather than using one ceiling for both. Mount this after
 * optionalAuth, which is what decides which branch a caller lands in.
 */
export function aiChatLimitByAudience(req: Request, res: Response, next: NextFunction) {
  return req.auth ? aiChatLimit(req, res, next) : aiGuestLimit(req, res, next);
}
