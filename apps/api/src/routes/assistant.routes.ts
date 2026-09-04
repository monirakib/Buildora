import { Router } from "express";
import { UserRole } from "@buildora/shared";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { aiChatLimitByAudience, aiDailyBudget, aiInlineLimit } from "../middleware/aiRateLimit";
import { chat, clearChat, getChat } from "../controllers/assistant.controller";
import { briefCoach } from "../controllers/aiCoach.controller";

export const assistantRouter = Router();

// Guests can ask questions; only signed-in users have stored history.
// The limiter runs after optionalAuth so it can tell the two apart — every
// answer here costs a model call against a free-tier quota.
assistantRouter.post("/chat", optionalAuth, aiChatLimitByAudience, aiDailyBudget, chat);
assistantRouter.get("/chat", requireAuth, getChat);
assistantRouter.delete("/chat", requireAuth, clearChat);

// The brief coach lives here rather than under /projects because there is no
// project yet — it checks a form that hasn't been submitted.
assistantRouter.post(
  "/brief-coach",
  requireAuth,
  requireRole(UserRole.LAND_OWNER),
  aiInlineLimit,
  aiDailyBudget,
  briefCoach
);
