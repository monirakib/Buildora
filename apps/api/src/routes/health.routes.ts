import { Router } from "express";
import mongoose from "mongoose";
import { APP_NAME } from "@buildora/shared";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: `${APP_NAME} API`,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: Math.round(process.uptime()),
  });
});
