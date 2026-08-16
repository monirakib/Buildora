import { Router } from "express";
import { UserRole } from "@buildora/shared";
import { estimateDelivery } from "../controllers/delivery.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { requireVerified } from "../middleware/verified";
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

// Seller listing management. Selling is verified-only: a listing is an offer
// to take a stranger's money for materials, and the trade licence and TIN a
// supplier submits are exactly what makes that offer answerable.
marketplaceRouter.get("/products/mine", requireAuth, seller, listMyProducts);
// Buyer-side: how far the stock has to travel to their plot, and how long.
marketplaceRouter.get("/products/:id/delivery", requireAuth, estimateDelivery);
marketplaceRouter.post("/products", requireAuth, seller, requireVerified, createProduct);
marketplaceRouter.patch("/products/:id", requireAuth, seller, requireVerified, updateProduct);
marketplaceRouter.delete("/products/:id", requireAuth, seller, requireVerified, deleteProduct);

// Orders: land owners place them; both sides list; status moves are checked
// in the controller (seller fulfils, buyer may cancel while PLACED).
//
// **Buying is deliberately open to unverified land owners** — it's the one
// thing an unverified account can do, and the reason is that ordering a few
// bags of cement carries none of the risk that posting a brief or funding
// escrow does. Note this is also why the status route below stays ungated:
// the buyer cancels their own order through the same endpoint the seller
// fulfils it with, so gating it would trap an unverified buyer in an order
// they can't get out of.
marketplaceRouter.post("/orders", requireAuth, requireRole(UserRole.LAND_OWNER), createOrder);
marketplaceRouter.get("/orders", requireAuth, listOrders);
marketplaceRouter.patch("/orders/:id/status", requireAuth, updateOrderStatus);
