import { Router } from "express";
import { createInquiry, listMyInquiries } from "../controllers/inquiries.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { UserRole } from "@buildora/shared";

export const inquiriesRouter = Router();

// Only land owners send inquiries; anyone signed in can list their own.
inquiriesRouter.post("/", requireAuth, requireRole(UserRole.LAND_OWNER), createInquiry);
inquiriesRouter.get("/mine", requireAuth, listMyInquiries);
