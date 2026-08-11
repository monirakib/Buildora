import { Router } from "express";
import {
  callbackEnded,
  callbackSuccess,
  getConfig,
  handleIpn,
  startCheckout,
} from "../controllers/payments.controller";
import { requireAuth } from "../middleware/auth";

export const paymentsRouter = Router();

paymentsRouter.get("/config", getConfig);
paymentsRouter.post("/checkout", requireAuth, startCheckout);

/**
 * Gateway callbacks. Deliberately unauthenticated: SSLCommerz posts these from
 * their servers (IPN) or bounces the payer's browser to them cross-site, and
 * neither carries our token. Security comes from the controller validating
 * every transaction directly with SSLCommerz before crediting anything — see
 * the note at the top of payments.controller.ts.
 *
 * Registered for POST and GET both: SSLCommerz posts a form, but some of their
 * flows (and any manual retry) come through as a plain GET.
 */
paymentsRouter.post("/callback/success", callbackSuccess);
paymentsRouter.get("/callback/success", callbackSuccess);
paymentsRouter.post("/callback/fail", callbackEnded);
paymentsRouter.get("/callback/fail", callbackEnded);
paymentsRouter.post("/callback/cancel", callbackEnded);
paymentsRouter.get("/callback/cancel", callbackEnded);
paymentsRouter.post("/ipn", handleIpn);
