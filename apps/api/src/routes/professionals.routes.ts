import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  getProfessional,
  listProfessionals,
  updateMyProfessionalProfile,
} from "../controllers/professionals.controller";
import { listArchitectReviews } from "../controllers/reviews.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

// Public — anyone can browse the professional directory before signing in.
export const professionalsRouter = Router();

professionalsRouter.get("/", listProfessionals);

// Registered before /:id so "me" isn't swallowed by the id parameter.
//
// Land owners are on this list even though they aren't professionals: this is
// the endpoint the verification wizard autosaves through, and they now run the
// same wizard. The handler writes whatever fields it's given onto `profile`,
// and a land owner's wizard only ever sends the identity, address and
// declaration ones — so there's nothing role-specific to guard here. ADMIN is
// absent because a supervisor has no profile to submit.
professionalsRouter.patch(
  "/me/profile",
  requireAuth,
  requireRole(
    UserRole.LAND_OWNER,
    UserRole.ARCHITECT,
    UserRole.STRUCTURAL_ENGINEER,
    UserRole.CONTRACTOR,
    UserRole.SUPPLIER
  ),
  updateMyProfessionalProfile
);

professionalsRouter.get("/:id", getProfessional);
// Public too — the reviews are part of how a land owner picks an architect.
professionalsRouter.get("/:id/reviews", listArchitectReviews);
