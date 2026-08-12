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
