import { Router } from "express";
import { checkMyNid, previewNid } from "../controllers/nid.controller";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const nidRouter = Router();

// Every role goes through this — land owners and professionals alike — so
// there's no requireRole here, only a session.
nidRouter.use(requireAuth);

nidRouter.get("/preview", previewNid);

// The full check reads an image and calls Gemini, so it's the expensive one.
// Limited per session-holder to keep a stuck form from looping on it.
nidRouter.post(
  "/check",
  rateLimit({ windowMs: 60_000, max: 10, message: "Too many NID checks — wait a minute" }),
  checkMyNid
);
