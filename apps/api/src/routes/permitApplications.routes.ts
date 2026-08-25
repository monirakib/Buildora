import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  addPermitDocument,
  createPermitApplication,
  getPermitApplication,
  listPendingPermitApplications,
  listPermitApplications,
  removePermitDocument,
  updatePermitApplication,
  verifyPermitApplication,
} from "../controllers/permitApplications.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const permitApplicationsRouter = Router();

// Applicant side — the project's owner/architect/engineer track their own
// self-reported RAJUK filing.
permitApplicationsRouter.post("/", requireAuth, createPermitApplication);
permitApplicationsRouter.get("/", requireAuth, listPermitApplications);
permitApplicationsRouter.get("/:id", requireAuth, getPermitApplication);
permitApplicationsRouter.patch("/:id", requireAuth, updatePermitApplication);
permitApplicationsRouter.post("/:id/documents", requireAuth, addPermitDocument);
permitApplicationsRouter.delete("/:id/documents/:key", requireAuth, removePermitDocument);

// Admin side — review queue and manual confirmation.
permitApplicationsRouter.get(
  "/admin/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  listPendingPermitApplications
);
permitApplicationsRouter.patch(
  "/:id/verify",
  requireAuth,
  requireRole(UserRole.ADMIN),
  verifyPermitApplication
);
