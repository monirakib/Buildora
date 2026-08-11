import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  acceptVenue,
  bookMeeting,
  cancelMeeting,
  chooseOfficeVenue,
  getArchitectSlots,
  getMyAvailability,
  listMyMeetings,
  proposeVenue,
  rescheduleMeeting,
  saveMyAvailability,
} from "../controllers/meetings.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const meetingsRouter = Router();

// An architect's own bookable hours.
meetingsRouter.get(
  "/availability",
  requireAuth,
  requireRole(UserRole.ARCHITECT),
  getMyAvailability
);
meetingsRouter.put(
  "/availability",
  requireAuth,
  requireRole(UserRole.ARCHITECT),
  saveMyAvailability
);

// Anyone signed in can look at an architect's open slots; only land owners book.
meetingsRouter.get("/architects/:id/slots", requireAuth, getArchitectSlots);
meetingsRouter.post("/", requireAuth, requireRole(UserRole.LAND_OWNER), bookMeeting);

// Everything below is for either side of a meeting they're already on — the
// controllers check membership, so no role guard applies.
meetingsRouter.get("/", requireAuth, listMyMeetings);
meetingsRouter.post("/:id/venue", requireAuth, proposeVenue);
meetingsRouter.post("/:id/venue/accept", requireAuth, acceptVenue);
meetingsRouter.post("/:id/venue/office", requireAuth, chooseOfficeVenue);
meetingsRouter.post("/:id/cancel", requireAuth, cancelMeeting);
meetingsRouter.post("/:id/reschedule", requireAuth, rescheduleMeeting);
