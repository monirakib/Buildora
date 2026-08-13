import { Router } from "express";
import { getPublicProgress } from "../controllers/publicshare.controller";

/**
 * The only unauthenticated data route in the platform.
 *
 * It is mounted outside every auth middleware on purpose: the whole point is
 * that someone with the link and no Buildora account can open it. What makes
 * that safe is the payload, not a guard — see publicshare.controller.
 */
export const publicRouter = Router();

publicRouter.get("/progress/:token", getPublicProgress);
