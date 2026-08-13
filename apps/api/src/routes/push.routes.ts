import { Router } from "express";
import {
  getNotificationPreferences,
  getPushConfig,
  listPushDevices,
  removePushDevice,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreferences,
} from "../controllers/push.controller";
import { requireAuth } from "../middleware/auth";

export const pushRouter = Router();

// The VAPID public key is deliberately unauthenticated: the browser needs it to
// build a subscription, it's designed to be public, and the service worker may
// ask for it before a session has been restored.
pushRouter.get("/config", getPushConfig);

// Everything else is scoped to the caller's own devices and preferences.
pushRouter.use(requireAuth);

pushRouter.post("/subscribe", subscribeToPush);
pushRouter.delete("/subscribe", unsubscribeFromPush);
pushRouter.get("/devices", listPushDevices);
pushRouter.delete("/devices/:id", removePushDevice);
pushRouter.get("/preferences", getNotificationPreferences);
pushRouter.patch("/preferences", updateNotificationPreferences);
pushRouter.post("/test", sendTestPush);
