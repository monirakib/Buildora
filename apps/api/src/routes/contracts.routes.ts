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

// Architect action.
contractsRouter.post("/:id/deliverables", requireRole(UserRole.ARCHITECT), submitDeliverable);
