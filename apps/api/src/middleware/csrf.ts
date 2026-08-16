import type { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "../config/origins";

/** The header a caller must send to redeem or clear a refresh cookie. */
export const REFRESH_HEADER = "x-buildora-refresh";

/**
 * Guards the two endpoints that authenticate with a cookie instead of a header.
 *
 * **Why only these two.** Every other route authenticates from an
 * Authorization header, which a browser never attaches on its own — so a
 * malicious page cannot make an authenticated request to them no matter what it
 * does. Cookies are the opposite: the browser sends them automatically, to
 * whoever set them, from whatever page happens to be open. That is CSRF, and it
 * applies to exactly the routes that read the refresh cookie.
 *
 * **What stops it.** A custom request header. To send one cross-origin, a
 * browser must first ask permission with a preflight OPTIONS request, and the
 * CORS policy only answers for our own origins — so the real request is never
 * made. A plain <form> POST or an <img> tag, the usual CSRF vehicles, cannot
 * set headers at all and fail here immediately.
 *
 * This matters because the refresh cookie is SameSite=None in production (the
 * web app and this API are on different sites, so nothing stricter would ever
 * be sent). None means the browser *will* attach it cross-site, which is
 * exactly the condition CSRF needs. This is the compensating control.
 *
 * The Origin check on top is belt and braces for browsers. Non-browser clients
 * (curl, tests) send no Origin and are allowed through — they have no ambient
 * cookie to be abused in the first place, which is the only thing CSRF exploits.
 */
export function requireRefreshIntent(req: Request, res: Response, next: NextFunction) {
  if (req.get(REFRESH_HEADER) !== "1") {
    return res.status(403).json({ error: { message: "Missing refresh header" } });
  }

  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: { message: "Origin not allowed" } });
  }

  return next();
}
