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
  floorPlanAdvice,
  listFloorPlans,
  saveFloorPlan,
} from "../controllers/floorplans.controller";
import { createTender, getBoqTemplate, getProjectTender } from "../controllers/tenders.controller";
import { getProjectBuild } from "../controllers/build.controller";
import {
  createSiteDiaryEntry,
  deleteSiteDiaryEntry,
  getDiaryDigest,
  getSiteForecast,
  listSiteDiary,
  updateSiteDiaryEntry,
} from "../controllers/sitediary.controller";
import {
  checkIn,
  checkOut,
  deleteCheckIn,
  listAttendance,
} from "../controllers/attendance.controller";
import { listProjectDisputes } from "../controllers/disputes.controller";
import { estimateProject } from "../controllers/estimator.controller";
import { draftProposal } from "../controllers/aiCoach.controller";
import {
  disableProjectShare,
  enableProjectShare,
  getProjectShare,
} from "../controllers/publicshare.controller";
import { acceptHandover, getHandover, saveHandover } from "../controllers/handover.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { requireVerified } from "../middleware/verified";
import { aiInlineLimit } from "../middleware/aiRateLimit";

export const projectsRouter = Router();

// Everything under /projects is for signed-in users.
projectsRouter.use(requireAuth);

// Briefs + lifecycle. `/mine` and `/briefs` must come before `/:id`.
//
// Reading a brief is open to anyone signed in; creating, publishing and moving
// one is not. An unverified owner can draft nothing and post nothing, because
// a brief is the invitation professionals spend unpaid hours answering.
projectsRouter.post("/", requireRole(UserRole.LAND_OWNER), requireVerified, createProject);
projectsRouter.get("/mine", listMyProjects);
projectsRouter.get("/briefs", requireRole(...PROFESSIONAL_ROLES), listOpenBriefs);
projectsRouter.get("/:id", getProject);
projectsRouter.patch("/:id", requireRole(UserRole.LAND_OWNER), requireVerified, updateProject);
projectsRouter.delete("/:id", requireRole(UserRole.LAND_OWNER), requireVerified, deleteProject);
projectsRouter.post("/:id/post", requireRole(UserRole.LAND_OWNER), requireVerified, postBrief);
projectsRouter.patch(
  "/:id/status",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  updateProjectStatus
);

// Proposals on a brief (architects pitch, the owner reads). The draft endpoint
// only writes text into the form — sending the pitch is still a separate POST.
//
// Pitching is gated: an unverified architect's proposal could never be accepted
// anyway (see proposals.controller), so letting them write one was a dead end
// that wasted their time. Now the wizard's promise and the rule agree.
projectsRouter.post(
  "/:id/proposals",
  requireRole(UserRole.ARCHITECT),
  requireVerified,
  createProposal
);
projectsRouter.get("/:id/proposals", listProjectProposals);
projectsRouter.post(
  "/:id/proposal-draft",
  requireRole(UserRole.ARCHITECT),
  aiInlineLimit,
  draftProposal
);

// The project's design contract (participants only; checked in the handler).
projectsRouter.get("/:id/contract", getProjectContract);

// ECPS permit tracker.
projectsRouter.get("/:id/ecps", getEcpsApplication);
projectsRouter.post("/:id/ecps", startEcpsApplication);
projectsRouter.get("/:id/disputes", listProjectDisputes);
projectsRouter.post("/:id/estimate", estimateProject);
projectsRouter.get("/:id/attendance", listAttendance);
projectsRouter.post("/:id/attendance", checkIn);
projectsRouter.post("/:id/attendance/:checkInId/out", checkOut);
projectsRouter.delete("/:id/attendance/:checkInId", deleteCheckIn);
projectsRouter.get("/:id/share", getProjectShare);
projectsRouter.post("/:id/share", enableProjectShare);
projectsRouter.delete("/:id/share", disableProjectShare);
projectsRouter.get("/:id/handover", getHandover);
projectsRouter.put("/:id/handover", saveHandover);
projectsRouter.post("/:id/handover/accept", acceptHandover);
projectsRouter.post("/:id/ecps/advance", advanceEcpsApplication);

// 2D floor plans — one per level (participants view, architect edits).
projectsRouter.get("/:id/floor-plans", listFloorPlans);
// Before the /:level routes, or "advice" would be parsed as a floor number.
// Rate limited because it spends the same free-tier quota as everything else AI.
projectsRouter.post("/:id/floor-plans/advice", aiInlineLimit, floorPlanAdvice);
projectsRouter.put("/:id/floor-plans/:level", requireVerified, saveFloorPlan);
projectsRouter.delete("/:id/floor-plans/:level", requireVerified, deleteFloorPlan);

// Contractor tendering and the build contract that follows an award.
projectsRouter.get(
  "/:id/boq-template",
  requireRole(UserRole.LAND_OWNER),
  requireVerified,
  getBoqTemplate
);
projectsRouter.get("/:id/tender", getProjectTender);
projectsRouter.post("/:id/tender", requireRole(UserRole.LAND_OWNER), requireVerified, createTender);
projectsRouter.get("/:id/build", getProjectBuild);

// Site diary — one entry per day, weather-stamped. `/forecast` before
// `/:entryId` so the literal path isn't swallowed by the parameter.
projectsRouter.get("/:id/diary/forecast", getSiteForecast);
projectsRouter.get("/:id/diary/digest", aiInlineLimit, getDiaryDigest);
projectsRouter.get("/:id/diary", listSiteDiary);
projectsRouter.post("/:id/diary", createSiteDiaryEntry);
projectsRouter.patch("/:id/diary/:entryId", updateSiteDiaryEntry);
projectsRouter.delete("/:id/diary/:entryId", deleteSiteDiaryEntry);

// Document archive.
projectsRouter.get("/:id/documents", listProjectDocuments);
projectsRouter.post("/:id/documents", addProjectDocument);
projectsRouter.delete("/:id/documents/:docId", deleteProjectDocument);
