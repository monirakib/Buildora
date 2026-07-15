import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  acceptProposal,
  declineProposal,
  listMyProposals,
  withdrawProposal,
} from "../controllers/proposals.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const proposalsRouter = Router();

proposalsRouter.use(requireAuth);

// Architect side.
proposalsRouter.get("/mine", requireRole(UserRole.ARCHITECT), listMyProposals);
proposalsRouter.post("/:id/withdraw", requireRole(UserRole.ARCHITECT), withdrawProposal);

// Owner side — the handlers verify the caller owns the project.
proposalsRouter.post("/:id/accept", requireRole(UserRole.LAND_OWNER), acceptProposal);
proposalsRouter.post("/:id/decline", requireRole(UserRole.LAND_OWNER), declineProposal);
