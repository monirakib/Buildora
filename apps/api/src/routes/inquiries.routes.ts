import { Router } from "express";
import { createInquiry, listMyInquiries } from "../controllers/inquiries.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { requireVerified } from "../middleware/verified";
import { UserRole } from "@buildora/shared";

export const inquiriesRouter = Router();

// Only land owners send inquiries; anyone signed in can list their own.
// Approaching an architect is verified-only — this is the step that puts an
// unknown person in a professional's inbox asking them to work.
inquiriesRouter.post(
  "/",
  requireAuth,
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  createInquiry
);
inquiriesRouter.get("/mine", requireAuth, listMyInquiries);
