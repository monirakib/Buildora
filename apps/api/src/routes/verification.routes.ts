import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
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

// Professional side — submit for review, check own status.
verificationRouter.post(
  "/submit",
  requireAuth,
  requireRole(...PROFESSIONAL_ROLES),
  submitVerification
);
verificationRouter.get(
  "/mine",
  requireAuth,
  requireRole(...PROFESSIONAL_ROLES),
  getMyVerification
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
