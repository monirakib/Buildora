import type { PaymentPurpose, PaymentSessionStatus } from "./enums";

/**
 * Gateway payments, through SSLCommerz.
 *
 * SSLCommerz is an aggregator: one checkout page fronts bKash, Nagad, Rocket,
 * Upay, cards and internet banking, so the app integrates once instead of once
 * per wallet. Every payable thing in Buildora — the concept fee, the design
 * escrow, the structural escrow, a materials order — goes through the same
 * endpoint, and `PaymentPurpose` is what tells the server which object to
 * settle when the money confirms.
 *
 * The single most important rule, and the reason the flow looks the way it
 * does: **the browser is never believed.** SSLCommerz redirects the payer back
 * to us with a POST saying "status: VALID", but anyone can forge that request.
 * The server takes only the `val_id` from it and asks SSLCommerz directly
 * whether that transaction is real and for how much. Nothing is credited until
 * that second call agrees.
 */

/** BDT limits SSLCommerz enforces on a single transaction. */
export const SSLCOMMERZ_MIN_BDT = 10;
export const SSLCOMMERZ_MAX_BDT = 500_000;

/** One attempt at paying for one thing. */
export interface PaymentSession {
  id: string;
  purpose: PaymentPurpose;
  /** The contract, engagement or order being paid for. */
  refId: string;
  amountBdt: number;
  status: PaymentSessionStatus;
  /** Our own reference, shown to the payer and sent to the gateway. */
  tranId: string;
  /** Which channel the payer actually used, e.g. "bKash", "VISA". */
  channel?: string;
  /** The gateway's own transaction reference, for reconciliation. */
  bankTranId?: string;
  failReason?: string;
  createdAt: string;
  paidAt?: string;
}

/** What the client gets back when it starts a checkout. */
export interface CheckoutStart {
  /** Send the browser here — the SSLCommerz hosted checkout page. */
  gatewayUrl: string;
  tranId: string;
  amountBdt: number;
}

/** Whether gateway payments are usable on this server. */
export interface PaymentConfig {
  /** False when no store credentials are set — the UI falls back to manual entry. */
  configured: boolean;
  /** True while pointed at the sandbox, so the UI can say "test payment". */
  sandbox: boolean;
}
