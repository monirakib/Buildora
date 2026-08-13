import { env } from "../config/env";

/**
 * SSLCommerz, over plain `fetch`.
 *
 * Their API is two form-encoded HTTP calls, so there's no SDK here for the same
 * reason there isn't one for Gemini or Nominatim — the whole integration is
 * legible in one file.
 *
 * The flow, and why it has the shape it does:
 *
 *   1. `createSession` POSTs the order to SSLCommerz and gets back a
 *      `GatewayPageURL`. We send the payer's browser there; they pick bKash,
 *      Nagad, Rocket, a card or internet banking on SSLCommerz's own page. No
 *      card or wallet credential ever touches this server, which is the entire
 *      point of using an aggregator.
 *
 *   2. When they're done, SSLCommerz sends their browser back to our success
 *      URL with a form POST that says `status=VALID`.
 *
 *   3. **We do not believe it.** That POST arrives over the open internet and
 *      anyone can hand-craft one. All we take from it is the `val_id`, and then
 *      `validate()` asks SSLCommerz directly — server to server, authenticated
 *      with the store password — whether that transaction is real, settled, and
 *      for how much. Only that answer moves money in our database.
 *
 * The store password is a credential: it stays in env, is sent only to
 * SSLCommerz over TLS, and is never logged or returned to a client.
 */

const SANDBOX_HOST = "https://sandbox.sslcommerz.com";
const LIVE_HOST = "https://securepay.sslcommerz.com";

function host(): string {
  return env.SSLCZ_SANDBOX ? SANDBOX_HOST : LIVE_HOST;
}

/** False when no store credentials are set — callers fall back to manual entry. */
export function isGatewayConfigured(): boolean {
  return Boolean(env.SSLCZ_STORE_ID && env.SSLCZ_STORE_PASSWORD);
}

export interface CreateSessionInput {
  /** Our own unique reference for this attempt. */
  tranId: string;
  amountBdt: number;
  /** Human label for the checkout page, e.g. "Design fee — Dhanmondi House". */
  productName: string;
  productCategory: string;
  customer: { name: string; email: string; phone?: string };
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

interface SessionResponse {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
}

/**
 * Opens a checkout session. Returns the hosted page URL to send the payer to.
 * Throws with a readable message — the caller is a user waiting on a button.
 */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const body = new URLSearchParams({
    store_id: env.SSLCZ_STORE_ID!,
    store_passwd: env.SSLCZ_STORE_PASSWORD!,
    // SSLCommerz wants two decimal places.
    total_amount: input.amountBdt.toFixed(2),
    currency: "BDT",
    tran_id: input.tranId,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    cancel_url: input.cancelUrl,
    ipn_url: input.ipnUrl,
    // Non-physical goods: no shipping step on the checkout page.
    shipping_method: "NO",
    product_name: input.productName,
    product_category: input.productCategory,
    product_profile: "general",
    cus_name: input.customer.name,
    cus_email: input.customer.email,
    cus_phone: input.customer.phone || "N/A",
    // Address fields are required by the API even for digital goods.
    cus_add1: "N/A",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
  });

  let res: Response;
  try {
    res = await fetch(`${host()}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    console.error("[sslcommerz] session request failed:", err);
    throw new Error("Couldn't reach the payment gateway, try again in a moment");
  }

  const data = (await res.json().catch(() => ({}))) as SessionResponse;
  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    // failedreason is SSLCommerz's own words and is safe to show — it's things
    // like "Store Credential Error" or an amount outside the allowed range.
    console.error(`[sslcommerz] session rejected: ${data.status} ${data.failedreason ?? ""}`);
    throw new Error(data.failedreason || "The payment gateway refused to open a session");
  }
  return data.GatewayPageURL;
}

/** What SSLCommerz says about a transaction when we ask it directly. */
export interface ValidationResult {
  /** True only for VALID or VALIDATED. */
  ok: boolean;
  status?: string;
  tranId?: string;
  /** The amount SSLCommerz actually settled, in BDT. */
  amountBdt?: number;
  currency?: string;
  bankTranId?: string;
  /** The channel the payer chose, e.g. "bKash", "VISA-Dutch Bangla Bank". */
  cardType?: string;
  reason?: string;
}

/**
 * Asks SSLCommerz whether a transaction is real. This is the only thing that
 * may authorise a credit in our database — see the note at the top.
 *
 * VALID means settled now; VALIDATED means it was already confirmed by an
 * earlier call (which happens whenever the browser return and the IPN both
 * land). Both are successes.
 */
export async function validate(valId: string): Promise<ValidationResult> {
  const query = new URLSearchParams({
    val_id: valId,
    store_id: env.SSLCZ_STORE_ID!,
    store_passwd: env.SSLCZ_STORE_PASSWORD!,
    format: "json",
  });

  try {
    const res = await fetch(`${host()}/validator/api/validationserverAPI.php?${query.toString()}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, string>;
    const status = data.status;
    return {
      ok: status === "VALID" || status === "VALIDATED",
      status,
      tranId: data.tran_id,
      amountBdt: data.amount ? Number(data.amount) : undefined,
      currency: data.currency,
      bankTranId: data.bank_tran_id,
      cardType: data.card_type,
      reason: data.error,
    };
  } catch (err) {
    console.error("[sslcommerz] validation failed:", err);
    // Deliberately not "ok" — an unreachable validator means we don't know, and
    // "don't know" must never credit an account.
    return { ok: false, reason: "Couldn't reach the payment gateway to confirm" };
  }
}
