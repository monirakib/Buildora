import type { CheckoutStart, PaymentConfig, PaymentPurpose } from "@buildora/shared";
import { request } from "./api";

/**
 * SSLCommerz checkout.
 *
 * The browser's only job is to open a session and then hand the payer over to
 * SSLCommerz's hosted page. Nothing about the payment is decided here — the
 * amount comes from the server (never from the client, or anyone could pay ৳1
 * for a ৳200,000 escrow), and the result comes back through the API's own
 * callback, not through this code.
 */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** GET /api/payments/config — is online payment available on this server? */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const res = await request<{ data: PaymentConfig }>("/api/payments/config");
  return res.data;
}

/**
 * POST /api/payments/checkout — opens a gateway session.
 *
 * Note what isn't sent: no amount. The server looks up what's actually owed for
 * this purpose and reference.
 */
export async function startCheckout(
  token: string,
  purpose: PaymentPurpose,
  refId: string
): Promise<CheckoutStart> {
  const res = await request<{ data: CheckoutStart }>("/api/payments/checkout", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ purpose, refId }),
  });
  return res.data;
}

/** Reads the ?payment=… flag the gateway callback redirects back with. */
export function readPaymentNotice(): { tone: "success" | "error"; message: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get("payment");
  if (!outcome) return null;

  // Clear it so a refresh doesn't replay the message.
  window.history.replaceState({}, "", window.location.pathname);

  const reason = params.get("reason");
  switch (outcome) {
    case "success":
      return { tone: "success", message: "Payment received." };
    case "cancelled":
      return { tone: "error", message: "Payment cancelled, nothing was charged." };
    case "failed":
      return { tone: "error", message: reason ?? "That payment didn't go through." };
    default:
      return { tone: "error", message: reason ?? "Something went wrong with that payment." };
  }
}
