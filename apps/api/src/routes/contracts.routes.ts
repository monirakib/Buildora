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
import { requireVerified } from "../middleware/verified";

export const contractsRouter = Router();

contractsRouter.use(requireAuth);

contractsRouter.get("/mine", listMyContracts);

// Client actions (the handlers also check the caller is *this* contract's
// client). All four move escrow or end an agreement, so all four are
// verified-only — cancelling included, since it returns funds.
contractsRouter.post(
  "/:id/pay-concept-fee",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  payConceptFee
);
contractsRouter.post(
  "/:id/fund-escrow",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  fundEscrow
);
contractsRouter.post(
  "/:id/deliverables/:index/decide",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  decideDeliverable
);
contractsRouter.post(
  "/:id/cancel",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  cancelContract
);

// Rating the architect — only open once the contract is COMPLETED, which the
// handler checks along with the caller being this contract's client. Left
// ungated: by this point the review is a record of work already delivered, and
// a public rating is more trustworthy for not being filtered by badge status.
contractsRouter.get("/:id/review", requireRole(UserRole.LAND_OWNER), getMyReview);
contractsRouter.post("/:id/review", requireRole(UserRole.LAND_OWNER), createReview);

// Architect action.
contractsRouter.post(
  "/:id/deliverables",
  requireRole(UserRole.ARCHITECT),
  requireVerified,
  submitDeliverable
);
