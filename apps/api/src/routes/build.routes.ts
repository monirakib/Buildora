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

export const buildRouter = Router();

buildRouter.use(requireAuth);

// Literal paths before `/:id/...` so neither is mistaken for a contract id.
buildRouter.get("/mine", listMyBuildContracts);
buildRouter.get("/inspection-templates", listInspectionTemplates);

// One milestone's journey: funded by the owner, claimed by the contractor,
// inspected by the engineer, released by the owner.
buildRouter.post("/:id/milestones/:milestoneId/fund", fundMilestone);
buildRouter.post("/:id/milestones/:milestoneId/claim", claimMilestone);
buildRouter.post("/:id/milestones/:milestoneId/inspect", inspectMilestone);
buildRouter.post("/:id/milestones/:milestoneId/release", releaseMilestone);
buildRouter.patch("/:id/milestones/:milestoneId", updateMilestone);

// ---- Variations ----
// Change orders hang off the build contract because that's what they change.
// The decide/withdraw routes key on the variation's own id, so they're mounted
// under /change-orders rather than nested under the contract.
buildRouter.get("/:id/change-orders", listChangeOrders);
buildRouter.post("/:id/change-orders", proposeChangeOrder);
buildRouter.post("/change-orders/:id/decide", decideChangeOrder);
buildRouter.post("/change-orders/:id/withdraw", withdrawChangeOrder);
