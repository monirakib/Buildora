import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  createProject,
  deleteProject,
  getProject,
  listMyProjects,
  listOpenBriefs,
  postBrief,
  updateProject,
  updateProjectStatus,
  PROFESSIONAL_ROLES,
} from "../controllers/projects.controller";
import { createProposal, listProjectProposals } from "../controllers/proposals.controller";
import { getProjectContract } from "../controllers/contracts.controller";
import {
  advanceEcpsApplication,
  getEcpsApplication,
  startEcpsApplication,
} from "../controllers/ecps.controller";
import {
  addProjectDocument,
  deleteProjectDocument,
  listProjectDocuments,
} from "../controllers/documents.controller";
import {
  deleteFloorPlan,
  listFloorPlans,
  saveFloorPlan,
} from "../controllers/floorplans.controller";
import { createTender, getBoqTemplate, getProjectTender } from "../controllers/tenders.controller";
import { getProjectBuild } from "../controllers/build.controller";
import {
  createSiteDiaryEntry,
  deleteSiteDiaryEntry,
  getSiteForecast,
  listSiteDiary,
  updateSiteDiaryEntry,
} from "../controllers/sitediary.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const projectsRouter = Router();

// Everything under /projects is for signed-in users.
projectsRouter.use(requireAuth);

// Briefs + lifecycle. `/mine` and `/briefs` must come before `/:id`.
projectsRouter.post("/", requireRole(UserRole.LAND_OWNER), createProject);
projectsRouter.get("/mine", listMyProjects);
projectsRouter.get("/briefs", requireRole(...PROFESSIONAL_ROLES), listOpenBriefs);
projectsRouter.get("/:id", getProject);
projectsRouter.patch("/:id", requireRole(UserRole.LAND_OWNER), updateProject);
projectsRouter.delete("/:id", requireRole(UserRole.LAND_OWNER), deleteProject);
projectsRouter.post("/:id/post", requireRole(UserRole.LAND_OWNER), postBrief);
projectsRouter.patch("/:id/status", requireRole(UserRole.LAND_OWNER), updateProjectStatus);

// Proposals on a brief (architects pitch, the owner reads).
projectsRouter.post("/:id/proposals", requireRole(UserRole.ARCHITECT), createProposal);
projectsRouter.get("/:id/proposals", listProjectProposals);

// The project's design contract (participants only; checked in the handler).
projectsRouter.get("/:id/contract", getProjectContract);

// ECPS permit tracker.
projectsRouter.get("/:id/ecps", getEcpsApplication);
projectsRouter.post("/:id/ecps", startEcpsApplication);
projectsRouter.post("/:id/ecps/advance", advanceEcpsApplication);

// 2D floor plans — one per level (participants view, architect edits).
projectsRouter.get("/:id/floor-plans", listFloorPlans);
projectsRouter.put("/:id/floor-plans/:level", saveFloorPlan);
projectsRouter.delete("/:id/floor-plans/:level", deleteFloorPlan);

// Contractor tendering and the build contract that follows an award.
projectsRouter.get("/:id/boq-template", requireRole(UserRole.LAND_OWNER), getBoqTemplate);
projectsRouter.get("/:id/tender", getProjectTender);
projectsRouter.post("/:id/tender", requireRole(UserRole.LAND_OWNER), createTender);
projectsRouter.get("/:id/build", getProjectBuild);

// Site diary — one entry per day, weather-stamped. `/forecast` before
// `/:entryId` so the literal path isn't swallowed by the parameter.
projectsRouter.get("/:id/diary/forecast", getSiteForecast);
projectsRouter.get("/:id/diary", listSiteDiary);
projectsRouter.post("/:id/diary", createSiteDiaryEntry);
projectsRouter.patch("/:id/diary/:entryId", updateSiteDiaryEntry);
projectsRouter.delete("/:id/diary/:entryId", deleteSiteDiaryEntry);

// Document archive.
projectsRouter.get("/:id/documents", listProjectDocuments);
projectsRouter.post("/:id/documents", addProjectDocument);
projectsRouter.delete("/:id/documents/:docId", deleteProjectDocument);
