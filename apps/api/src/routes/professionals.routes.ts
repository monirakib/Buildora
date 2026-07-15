import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  getProfessional,
  listProfessionals,
  updateMyProfessionalProfile,
} from "../controllers/professionals.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

// Public — anyone can browse the professional directory before signing in.
export const professionalsRouter = Router();

professionalsRouter.get("/", listProfessionals);

// Registered before /:id so "me" isn't swallowed by the id parameter.
professionalsRouter.patch(
  "/me/profile",
  requireAuth,
  requireRole(
    UserRole.ARCHITECT,
    UserRole.STRUCTURAL_ENGINEER,
    UserRole.CONTRACTOR,
    UserRole.SUPPLIER
  ),
  updateMyProfessionalProfile
);

professionalsRouter.get("/:id", getProfessional);
