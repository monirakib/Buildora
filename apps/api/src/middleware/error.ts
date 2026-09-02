import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: "Route not found" } });
}

/**
 * A MongoDB duplicate-key rejection, with the index that refused the write.
 * Mongoose passes the driver's error through untouched, so this is duck-typed
 * rather than an instanceof check.
 */
function duplicateKeyIndex(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (candidate.code !== 11000) return undefined;
  return Object.keys(candidate.keyPattern ?? {})[0] ?? "";
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // The one-NID-one-account rule is enforced by a unique index, and the handlers
  // that write an NID check for a clash first so the user gets a real
  // explanation. This is the backstop for any path that doesn't — without it a
  // race between two signups surfaces as a bare 500.
  const index = duplicateKeyIndex(err);
  if (index === "profile.nidKeyBlind") {
    return res.status(409).json({
      error: {
        code: "NID_ALREADY_REGISTERED",
        message: "Another Buildora account is already registered with this NID.",
      },
    });
  }

  /**
   * A short reference, logged here and returned to the caller.
   *
   * Production deliberately hides the real message (see below), which left a
   * user reporting "it said internal server error" and nothing to search the
   * logs for. The reference closes that gap without revealing anything: it is
   * random, it means nothing on its own, and it is the only thing tying a
   * screenshot to a stack trace.
   */
  const reference = randomUUID().slice(0, 8);

  // Method and path only — never the body, and never the query string.
  // `req.path` excludes the query on purpose: /api/auth/verify-email carries a
  // single-use token there, and /api/auth/login and /register carry plaintext
  // passwords in the body. A logger that printed either would write them to
  // disk in the clear. If a full HTTP request logger is ever added, it needs a
  // redaction list before it goes anywhere near those routes.
  console.error(`[api] Unhandled error ${reference} on ${req.method} ${req.path}:`, err);

  // Only development sees the real message. Read from the validated config
  // rather than process.env directly: the old check was `!== "production"`,
  // which quietly means "development" whenever NODE_ENV is simply unset — so a
  // deploy that forgot to set it leaked internal driver and database messages
  // to every client. Naming the one environment that may see them fails safe.
  const message =
    err instanceof Error && env.NODE_ENV === "development" ? err.message : "Internal server error";
  return res.status(500).json({ error: { message, reference } });
}
