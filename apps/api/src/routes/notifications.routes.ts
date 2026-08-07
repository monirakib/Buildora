import { Router } from "express";
import {
  clearNotifications,
  deleteNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notifications.controller";
import { requireAuth } from "../middleware/auth";

export const notificationsRouter = Router();

// Your notifications are yours: every route is scoped to the caller, no roles
// involved. Sending notifications isn't a route — the platform creates them as
// a side effect of real events (and admins broadcast via /api/admin/broadcasts).
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", listNotifications);
notificationsRouter.get("/unread-count", getUnreadNotificationCount);
notificationsRouter.post("/read-all", markAllNotificationsRead);
notificationsRouter.post("/:id/read", markNotificationRead);
notificationsRouter.delete("/:id", deleteNotification);
notificationsRouter.delete("/", clearNotifications);
