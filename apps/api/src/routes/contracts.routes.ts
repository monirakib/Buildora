import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  cancelContract,
  decideDeliverable,
  fundEscrow,
  listMyContracts,
  payConceptFee,
  submitDeliverable,
} from "../controllers/contracts.controller";
import { createReview, getMyReview } from "../controllers/reviews.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const contractsRouter = Router();

contractsRouter.use(requireAuth);

contractsRouter.get("/mine", listMyContracts);

// Client actions (the handlers also check the caller is *this* contract's client).
contractsRouter.post("/:id/pay-concept-fee", requireRole(UserRole.LAND_OWNER), payConceptFee);
contractsRouter.post("/:id/fund-escrow", requireRole(UserRole.LAND_OWNER), fundEscrow);
contractsRouter.post(
  "/:id/deliverables/:index/decide",
  requireRole(UserRole.LAND_OWNER),
  decideDeliverable
);
contractsRouter.post("/:id/cancel", requireRole(UserRole.LAND_OWNER), cancelContract);

// Rating the architect — only open once the contract is COMPLETED, which the
// handler checks along with the caller being this contract's client.
contractsRouter.get("/:id/review", requireRole(UserRole.LAND_OWNER), getMyReview);
contractsRouter.post("/:id/review", requireRole(UserRole.LAND_OWNER), createReview);

// Architect action.
contractsRouter.post("/:id/deliverables", requireRole(UserRole.ARCHITECT), submitDeliverable);
