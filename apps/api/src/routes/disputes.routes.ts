import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  getDispute,
  listDisputes,
  listMyDisputes,
  raiseDispute,
  resolveDispute,
  withdrawDispute,
} from "../controllers/disputes.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const disputesRouter = Router();

disputesRouter.use(requireAuth);

// Either party to the money can raise one, read their own, or withdraw.
disputesRouter.post("/", raiseDispute);
disputesRouter.get("/mine", listMyDisputes);

// The supervisor's queue. Declared before "/:id" so "mine" and this can't be
// swallowed by the id route.
disputesRouter.get("/", requireRole(UserRole.ADMIN), listDisputes);

disputesRouter.get("/:id", getDispute);
disputesRouter.post("/:id/withdraw", withdrawDispute);

// Only a supervisor ends a dispute — this is the one place escrow moves on
// someone else's say-so.
disputesRouter.post("/:id/resolve", requireRole(UserRole.ADMIN), resolveDispute);
