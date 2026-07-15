import { Router } from "express";
import {
  getConversationMessages,
  getUnreadCount,
  listConversations,
  openConversation,
  sendMessage,
} from "../controllers/messages.controller";
import { requireAuth } from "../middleware/auth";

export const messagesRouter = Router();

// Messaging is available to every signed-in user, whatever their role.
messagesRouter.use(requireAuth);

messagesRouter.get("/unread-count", getUnreadCount);
messagesRouter.get("/conversations", listConversations);
messagesRouter.post("/conversations", openConversation);
messagesRouter.get("/conversations/:id", getConversationMessages);
messagesRouter.post("/conversations/:id", sendMessage);
