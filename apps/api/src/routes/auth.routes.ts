import { Router } from "express";
import {
  changeEmail,
  changePassword,
  jwks,
  listSessions,
  login,
  logout,
  me,
  refresh,
  register,
  registerProfessional,
  revokeSessions,
  sendVerificationEmail,
  updateAccount,
  updateProfile,
  verifyEmail,
} from "../controllers/auth.controller";
import { checkIabMembership } from "../controllers/verification.controller";
import { requireAuth } from "../middleware/auth";
import { requireRefreshIntent } from "../middleware/csrf";
import { rateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

/**
 * Signup and sign-in are the endpoints an attacker can reach without an
 * account, so they carry their own limits.
 *
 * Login is the one that matters: without a limit, nothing stops a script
 * working through a password list against a known email, and the argon2id cost
 * added in services/password.ts slows each guess but does not cap how many can
 * be made. Ten attempts per quarter hour leaves room for someone genuinely
 * misremembering their password and takes online guessing off the table.
 *
 * Both are keyed by IP, which is the only identity available before sign-in.
 * That means a shared university network shares a bucket — acceptable for
 * these two, and the reason the limiter supports keying by user id elsewhere.
 */
authRouter.post(
  "/register",
  rateLimit({
    windowMs: 60 * 60_000,
    max: 5,
    message: "Too many accounts created from here, try again later",
  }),
  register
);
authRouter.post(
  "/register-professional",
  rateLimit({
    windowMs: 60 * 60_000,
    max: 5,
    message: "Too many accounts created from here, try again later",
  }),
  registerProfessional
);

// IAB directory lookup for the signup form, which runs before there's an
// account to authenticate. Same handler as /api/verification/iab; the rate
// limit is here because this copy is open to anyone, and every call costs IAB
// a request. Generous enough that a person filling in a form never notices.
authRouter.get(
  "/iab",
  rateLimit({ windowMs: 60_000, max: 20, message: "Too many lookups, wait a minute" }),
  checkIabMembership
);
authRouter.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    message: "Too many sign-in attempts, wait a few minutes and try again",
  }),
  login
);
/**
 * The two cookie-facing endpoints. Both carry the CSRF guard; nothing else in
 * the API needs it, because nothing else authenticates from a cookie.
 *
 * Refresh is deliberately not rate limited: a legitimate tab calls it every few
 * minutes, a shared campus network multiplies that by everyone on it, and a
 * junk token is thrown out by an HMAC check before any database work happens —
 * so the endpoint is cheap to refuse and expensive to limit correctly.
 */
// Public: the verifying half of the token signing keys. Nothing here is secret.
authRouter.get("/jwks", jwks);

authRouter.post("/refresh", requireRefreshIntent, refresh);
authRouter.post("/logout", requireRefreshIntent, requireAuth, logout);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/profile", requireAuth, updateProfile);

// Account settings — shared by every role, unlike the role-specific profile.
authRouter.patch("/account", requireAuth, updateAccount);
authRouter.post("/change-email", requireAuth, changeEmail);

// Confirming an email address. The link itself is opened by whoever is holding
// the mailbox, so /verify-email takes no session — the token is the proof.
// Asking for a link does need one, plus a limit: the service already refuses
// more than one a minute per account, and this stops a script cycling accounts.
authRouter.post(
  "/verify-email",
  rateLimit({ windowMs: 60_000, max: 20, message: "Too many attempts, wait a minute" }),
  verifyEmail
);
authRouter.post(
  "/verify-email/send",
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 5, message: "Too many requests, wait a minute" }),
  sendVerificationEmail
);
authRouter.post("/change-password", requireAuth, changePassword);

// Devices — the logins currently able to use this account, and ending them.
authRouter.get("/sessions", requireAuth, listSessions);
authRouter.post("/sessions/revoke", requireAuth, revokeSessions);
