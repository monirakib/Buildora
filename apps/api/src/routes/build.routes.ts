import { Router } from "express";
import {
  claimMilestone,
  fundMilestone,
  inspectMilestone,
  listInspectionTemplates,
  listMyBuildContracts,
  releaseMilestone,
  updateMilestone,
} from "../controllers/build.controller";
import {
  decideChangeOrder,
  listChangeOrders,
  proposeChangeOrder,
  withdrawChangeOrder,
} from "../controllers/changeorders.controller";
import { requireAuth } from "../middleware/auth";
import { requireVerified } from "../middleware/verified";

export const buildRouter = Router();

buildRouter.use(requireAuth);

// Literal paths before `/:id/...` so neither is mistaken for a contract id.
buildRouter.get("/mine", listMyBuildContracts);
buildRouter.get("/inspection-templates", listInspectionTemplates);

// One milestone's journey: funded by the owner, claimed by the contractor,
// inspected by the engineer, released by the owner. Every step of that chain
// moves escrow, so every step is verified-only — the engineer's inspection
// most of all, since their signature is what releases the tranche.
buildRouter.post("/:id/milestones/:milestoneId/fund", requireVerified, fundMilestone);
buildRouter.post("/:id/milestones/:milestoneId/claim", requireVerified, claimMilestone);
buildRouter.post("/:id/milestones/:milestoneId/inspect", requireVerified, inspectMilestone);
buildRouter.post("/:id/milestones/:milestoneId/release", requireVerified, releaseMilestone);
buildRouter.patch("/:id/milestones/:milestoneId", requireVerified, updateMilestone);

// ---- Variations ----
// Change orders hang off the build contract because that's what they change.
// The decide/withdraw routes key on the variation's own id, so they're mounted
// under /change-orders rather than nested under the contract.
buildRouter.get("/:id/change-orders", listChangeOrders);
buildRouter.post("/:id/change-orders", proposeChangeOrder);
buildRouter.post("/change-orders/:id/decide", decideChangeOrder);
buildRouter.post("/change-orders/:id/withdraw", withdrawChangeOrder);
