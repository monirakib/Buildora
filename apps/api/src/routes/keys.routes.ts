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
 * Every route here is SUPER_ADMIN and only SUPER_ADMIN.
 *
 * `requireRole` is an exact match, so an ADMIN gets a 403 from this router just
 * as any other role would — the admin console and the keys are separate
 * capabilities held by separate accounts. That is the entire reason the role
 * exists, and this one line is where it is enforced.
 */
keysRouter.use(requireAuth, requireRole(UserRole.SUPER_ADMIN));

keysRouter.get("/status", keyStatus);
keysRouter.get("/rotations", listRotations);
keysRouter.post("/rotations", createRotation);
keysRouter.get("/rotations/:id", getRotation);
keysRouter.post("/rotations/:id/resume", resumeRotation);
keysRouter.post("/rotations/:id/verify", verifyRotationRun);
