import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  getOverview,
  listAllOrders,
  listAllProducts,
  listUsers,
  revokeUserSessions,
  setProductActive,
  updateUserRole,
} from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const adminRouter = Router();

// Everything under /api/admin is supervisor-only.
adminRouter.use(requireAuth, requireRole(UserRole.ADMIN));

adminRouter.get("/overview", getOverview);
adminRouter.get("/users", listUsers);
adminRouter.patch("/users/:id/role", updateUserRole);
adminRouter.post("/users/:id/revoke-sessions", revokeUserSessions);
adminRouter.get("/market/products", listAllProducts);
adminRouter.patch("/market/products/:id", setProductActive);
adminRouter.get("/market/orders", listAllOrders);
