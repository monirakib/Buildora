import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  appointEngineer,
  cancelEngagement,
  commentOnDrawings,
  fundEscrow,
  getForProject,
  listMyEngagements,
  reviewDrawings,
  submitDrawings,
} from "../controllers/structural.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { requireVerified } from "../middleware/verified";

export const structuralRouter = Router();

// Only a land owner can appoint and pay; the controller also checks the
// project is theirs and that the design contract is finished.
structuralRouter.post(
  "/",
  requireAuth,
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  appointEngineer
);

structuralRouter.get("/mine", requireAuth, listMyEngagements);
structuralRouter.get("/project/:id", requireAuth, getForProject);

// The rest are for people already on the engagement — the controllers check
// which side the caller is on, so no role guard applies here.
//
// Commenting stays open. It's a conversation about drawings, and cutting off
// someone's ability to reply mid-engagement helps nobody; funding, delivering
// and signing off are the actions with money behind them.
structuralRouter.post("/:id/escrow", requireAuth, requireVerified, fundEscrow);
structuralRouter.post("/:id/submissions", requireAuth, requireVerified, submitDrawings);
structuralRouter.post("/:id/review", requireAuth, requireVerified, reviewDrawings);
structuralRouter.post("/:id/comment", requireAuth, commentOnDrawings);
structuralRouter.post("/:id/cancel", requireAuth, cancelEngagement);
