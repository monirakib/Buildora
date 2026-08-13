import { Router } from "express";
import {
  changeEmail,
  changePassword,
  listSessions,
  login,
  logout,
  me,
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
import { rateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/register-professional", registerProfessional);

// IAB directory lookup for the signup form, which runs before there's an
// account to authenticate. Same handler as /api/verification/iab; the rate
// limit is here because this copy is open to anyone, and every call costs IAB
// a request. Generous enough that a person filling in a form never notices.
authRouter.get(
  "/iab",
  rateLimit({ windowMs: 60_000, max: 20, message: "Too many lookups, wait a minute" }),
  checkIabMembership
);
authRouter.post("/login", login);
authRouter.post("/logout", requireAuth, logout);
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
