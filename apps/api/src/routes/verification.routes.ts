import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  checkIabMembership,
  decideVerificationRequest,
  getMyVerification,
  getVerificationRequest,
  listVerificationRequests,
  submitVerification,
} from "../controllers/verification.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const verificationRouter = Router();

const PROFESSIONAL_ROLES = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
] as const;

/**
 * Everyone who can be verified — the four professions plus land owners.
 * ADMIN is absent because a supervisor is the one doing the verifying; there
 * is nobody above them to approve their documents.
 */
const VERIFIABLE_ROLES = [UserRole.LAND_OWNER, ...PROFESSIONAL_ROLES] as const;

// Applicant side — submit for review, check own status. Land owners go through
// the same queue as professionals; only their checklist differs.
verificationRouter.post(
  "/submit",
  requireAuth,
  requireRole(...VERIFIABLE_ROLES),
  submitVerification
);
verificationRouter.get("/mine", requireAuth, requireRole(...VERIFIABLE_ROLES), getMyVerification);

// IAB directory lookup — the architect runs it from the wizard, the supervisor
// re-runs it while reviewing. Signed-in only: it proxies a public directory and
// shouldn't be an open lookup service for anyone on the internet.
verificationRouter.get(
  "/iab",
  requireAuth,
  requireRole(...PROFESSIONAL_ROLES, UserRole.ADMIN),
  checkIabMembership
);

// Supervisor side — review queue and decisions.
verificationRouter.get(
  "/requests",
  requireAuth,
  requireRole(UserRole.ADMIN),
  listVerificationRequests
);
verificationRouter.get(
  "/requests/:id",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getVerificationRequest
);
verificationRouter.post(
  "/requests/:id/decide",
  requireAuth,
  requireRole(UserRole.ADMIN),
  decideVerificationRequest
);
