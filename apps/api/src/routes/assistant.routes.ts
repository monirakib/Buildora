import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { chat, clearChat, getChat } from "../controllers/assistant.controller";

export const assistantRouter = Router();

// Guests can ask questions; only signed-in users have stored history.
assistantRouter.post("/chat", optionalAuth, chat);
assistantRouter.get("/chat", requireAuth, getChat);
assistantRouter.delete("/chat", requireAuth, clearChat);
