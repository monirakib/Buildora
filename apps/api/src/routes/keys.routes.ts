import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  createRotation,
  getRotation,
  keyStatus,
  listRotations,
  resumeRotation,
  verifyRotationRun,
} from "../controllers/keys.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const keysRouter = Router();

/**
 * Every route here is ADMIN and only ADMIN.
 *
 * This used to be a separate SUPER_ADMIN role, kept apart from the admin
 * console so that compromising one didn't hand over the other. That split was
 * removed: key rotation now lives alongside the rest of platform supervision,
 * reachable from the same admin console and the same account.
 */
keysRouter.use(requireAuth, requireRole(UserRole.ADMIN));

keysRouter.get("/status", keyStatus);
keysRouter.get("/rotations", listRotations);
keysRouter.post("/rotations", createRotation);
keysRouter.get("/rotations/:id", getRotation);
keysRouter.post("/rotations/:id/resume", resumeRotation);
keysRouter.post("/rotations/:id/verify", verifyRotationRun);
