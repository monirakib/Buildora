import { Router } from "express";
import {
  getConversationMessages,
  getUnreadCount,
  listConversations,
  openConversation,
  sendMessage,
} from "../controllers/messages.controller";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const messagesRouter = Router();

// Messaging is available to every signed-in user, whatever their role.
messagesRouter.use(requireAuth);

/**
 * Sending is the one write here that reaches another person: it lands in their
 * inbox, bumps their unread count and can fire a push notification. Without a
 * ceiling, one account can flood another's inbox faster than they can read it.
 *
 * Only the two send routes carry it — reading and polling are handled by the
 * baseline in app.ts. Sixty a minute is a fast typist's upper bound and nowhere
 * near a script's.
 */
const sendLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyBy: (req) => req.auth!.sub,
  message: "You're sending messages very quickly, wait a moment",
});

messagesRouter.get("/unread-count", getUnreadCount);
messagesRouter.get("/conversations", listConversations);
messagesRouter.post("/conversations", sendLimit, openConversation);
messagesRouter.get("/conversations/:id", getConversationMessages);
messagesRouter.post("/conversations/:id", sendLimit, sendMessage);
