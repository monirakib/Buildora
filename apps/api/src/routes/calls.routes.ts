import { Router } from "express";
import { getIceConfig, listRecentCalls } from "../controllers/calls.controller";
import { requireAuth } from "../middleware/auth";

export const callsRouter = Router();

// Calling is available to every signed-in user, whatever their role.
callsRouter.use(requireAuth);

callsRouter.get("/ice-config", getIceConfig);
callsRouter.get("/", listRecentCalls);
