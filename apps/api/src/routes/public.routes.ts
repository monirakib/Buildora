import { Router } from "express";
import { getPublicProgress } from "../controllers/publicshare.controller";
import { rateLimit } from "../middleware/rateLimit";

/**
 * The only unauthenticated data route in the platform.
 *
 * It is mounted outside every auth middleware on purpose: the whole point is
 * that someone with the link and no Buildora account can open it. What makes
 * that safe is the payload, not a guard — see publicshare.controller.
 */
export const publicRouter = Router();

/**
 * The share token is a random string, and the only way in. That makes this the
 * one endpoint on the platform where guessing is a plausible attack: with no
 * limit, a script can try tokens as fast as the server answers and eventually
 * find a live one. A ceiling per address turns "keep trying" into "give up".
 *
 * Sixty a minute leaves an owner sharing a link with a WhatsApp group, all of
 * whom open it at once, completely unaffected.
 */
publicRouter.get(
  "/progress/:token",
  rateLimit({
    windowMs: 60_000,
    max: 60,
    message: "Too many requests, wait a moment and reload",
  }),
  getPublicProgress
);
