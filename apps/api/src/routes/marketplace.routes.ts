import { Router } from "express";
import { UserRole } from "@buildora/shared";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import {
  createOrder,
  createProduct,
  deleteProduct,
  listMyProducts,
  listOrders,
  listProducts,
  updateOrderStatus,
  updateProduct,
} from "../controllers/marketplace.controller";

export const marketplaceRouter = Router();

// Suppliers ("brands") and contractors sell; land owners buy.
const seller = requireRole(UserRole.SUPPLIER, UserRole.CONTRACTOR);

// Catalogue is public — anyone can window-shop.
marketplaceRouter.get("/products", listProducts);

// Seller listing management.
marketplaceRouter.get("/products/mine", requireAuth, seller, listMyProducts);
marketplaceRouter.post("/products", requireAuth, seller, createProduct);
marketplaceRouter.patch("/products/:id", requireAuth, seller, updateProduct);
marketplaceRouter.delete("/products/:id", requireAuth, seller, deleteProduct);

// Orders: land owners place them; both sides list; status moves are checked
// in the controller (seller fulfils, buyer may cancel while PLACED).
marketplaceRouter.post("/orders", requireAuth, requireRole(UserRole.LAND_OWNER), createOrder);
marketplaceRouter.get("/orders", requireAuth, listOrders);
marketplaceRouter.patch("/orders/:id/status", requireAuth, updateOrderStatus);
