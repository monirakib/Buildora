import type { NextFunction, Request, Response } from "express";

/**
 * A small fixed-window rate limiter, kept in memory.
 *
 * It exists for the one endpoint that has to answer people who aren't signed in
 * yet — the IAB lookup on the signup form. Everything else sits behind
 * requireAuth, where the session is the limit.
 *
 * In memory is the right scope here: the API runs as a single process, and the
 * worst case of a restart clearing the counters is that a caller gets a fresh
 * window. Nothing security-critical rests on it — it's there so one script
 * can't hammer IAB through us.
 */
export function rateLimit({
  windowMs,
  max,
  message = "Too many requests, wait a moment and try again",
  keyBy,
}: {
  windowMs: number;
  max: number;
  message?: string;
  /**
   * What counts as "one caller". Defaults to the IP, which is right for the
   * signed-out endpoints this was written for. Routes that sit behind
   * requireAuth pass a function reading the user id instead — a university lab
   * is one IP, and sharing a bucket across everyone on it would be wrong.
   */
  keyBy?: (req: Request) => string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = keyBy ? keyBy(req) : (req.ip ?? "unknown");

    // Drop expired windows as we go, so the map can't grow without bound.
    for (const [k, v] of hits) {
      if (v.resetAt <= now) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: { message } });
    }
    return next();
  };
}
