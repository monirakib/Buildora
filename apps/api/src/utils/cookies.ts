import type { Response } from "express";
import { env } from "../config/env";

/** The refresh cookie's name. Short and unremarkable — it names nothing useful. */
export const REFRESH_COOKIE = "bd_rt";

/**
 * Where the browser is allowed to send the refresh cookie.
 *
 * Scoping it to /api/auth is the point: the token is only ever redeemed at
 * /api/auth/refresh and cleared at /api/auth/logout, so there is no reason for
 * it to ride along on the hundred other API calls the app makes. A cookie that
 * isn't sent can't be leaked by whatever mishandles a request elsewhere.
 */
const COOKIE_PATH = "/api/auth";

function options() {
  return {
    /**
     * The whole reason this is a cookie and not another localStorage entry:
     * httpOnly means JavaScript cannot read it, so an XSS bug on the web app
     * can steal at most a 15-minute access token, not the week-long credential
     * behind it.
     */
    httpOnly: true,
    /**
     * HTTPS only. Tied to NODE_ENV because local development is plain http and
     * a Secure cookie would simply never be stored there. Note SameSite=None
     * *requires* Secure — browsers reject the combination without it — which is
     * consistent, since None is only used in production.
     */
    secure: env.NODE_ENV === "production",
    sameSite: env.SESSION_COOKIE_SAMESITE,
    domain: env.SESSION_COOKIE_DOMAIN || undefined,
    path: COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...options(),
    // Matches the session's own hard stop, so the cookie and the row behind it
    // die together rather than the browser holding a token the server forgot.
    maxAge: env.SESSION_MAX_HOURS * 60 * 60 * 1000,
  });
}

/**
 * Clears the cookie. The attributes have to match the ones it was set with —
 * path and domain included — or the browser treats it as a different cookie and
 * quietly keeps the original.
 */
export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, options());
}
