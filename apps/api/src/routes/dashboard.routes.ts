import { Router } from "express";
import { getDashboardSummary } from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/auth";

export const dashboardRouter = Router();

// Every role has a dashboard; the controller shapes it per role.
dashboardRouter.get("/summary", requireAuth, getDashboardSummary);
