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

/* ------------------------------------------------------------ daily caps ---- */

/**
 * The per-minute limits above stop a stuck button. They do not stop a patient
 * one: ten a minute, kept up for an afternoon, is several hundred calls from a
 * single account — and the thing being protected is a *daily* free-tier quota,
 * so the ceiling that matters has to be daily too.
 *
 * Two of them, and both are needed:
 *
 * - a per-person cap, so no single account can drink the day's quota; and
 * - a platform cap, because forty people each politely inside their own limit
 *   still adds up to more than the free tier allows. Without it, the platform
 *   ceiling is "however many users we have", which is not a ceiling.
 *
 * The platform bucket keys every request to the same string on purpose — one
 * shared counter for the whole site.
 */
const DAY_MS = 24 * 60 * 60_000;

/** Enough for a full day of real use, far short of what a script would want. */
export const aiUserDailyLimit = rateLimit({
  windowMs: DAY_MS,
  max: 120,
  keyBy: byUser,
  message: "You've used today's AI help on this account. It resets tomorrow.",
});

/**
 * The whole platform's daily budget, shared. Set below the free tiers' combined
 * ceiling so a busy day degrades into "try again tomorrow" rather than into a
 * provider cutting us off mid-demo.
 */
export const aiPlatformDailyLimit = rateLimit({
  windowMs: DAY_MS,
  max: 1500,
  keyBy: () => "platform",
  message: "Buildora's AI features have hit today's shared limit. They'll be back tomorrow.",
});

/**
 * Both daily caps as one thing to mount, since no route wants one without the
 * other. Express takes an array of middleware wherever it takes one.
 */
export const aiDailyBudget = [aiUserDailyLimit, aiPlatformDailyLimit];
