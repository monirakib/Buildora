import crypto from "node:crypto";
import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  ContractStatus,
  NotificationType,
  OrderStatus,
  PaymentKind,
  PaymentMethod,
  PaymentPurpose,
  PaymentSessionStatus,
  SSLCOMMERZ_MAX_BDT,
  SSLCOMMERZ_MIN_BDT,
  StructuralStatus,
  type PaymentConfig,
} from "@buildora/shared";
import { env } from "../config/env";
import { Contract } from "../models/Contract";
import { MarketOrder } from "../models/MarketOrder";
import { PaymentSession, type PaymentSessionDoc } from "../models/PaymentSession";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { User } from "../models/User";
import { notify } from "../services/notifications";
import { createSession, isGatewayConfigured, validate } from "../services/sslcommerz";

/**
 * Gateway payments.
 *
 * Every payable thing funnels through here: the concept fee, the design
 * escrow, the structural escrow, and marketplace orders. `PaymentPurpose` is
 * the discriminator — `describe()` works out what is owed and by whom before a
 * session opens, and `settle()` applies the effect once the money is confirmed.
 *
 * Two invariants hold this together, and most of the code below exists to keep
 * them:
 *
 *   1. **Only SSLCommerz's own validator may authorise a credit.** The payer's
 *      browser comes back with a POST claiming success; that POST is treated as
 *      nothing more than a hint containing a `val_id`.
 *
 *   2. **Settlement runs at most once per session.** The browser return and the
 *      server-to-server IPN both report the same success, so `appliedAt` is
 *      checked before any money moves.
 */

// ---------------------------------------------------------------------------
// What is being paid for
// ---------------------------------------------------------------------------

interface Payable {
  amountBdt: number;
  /** Shown on the SSLCommerz checkout page. */
  label: string;
  category: string;
  /** Where to send the payer once they're done. */
  returnPath: string;
  /** Non-null when this thing can't be paid for right now, with the reason. */
  blocked?: string;
}

/**
 * Resolves a purpose + reference into "what's owed, by whom, and is it payable
 * right now". Returns null when the caller has no business paying for it, so
 * the endpoint can 404 without leaking whether the object exists.
 */
async function describe(
  purpose: PaymentPurpose,
  refId: string,
  userId: string
): Promise<Payable | null> {
  switch (purpose) {
    case PaymentPurpose.CONTRACT_CONCEPT_FEE:
    case PaymentPurpose.CONTRACT_ESCROW: {
      const contract = await Contract.findById(refId).populate({ path: "project", select: "title" });
      if (!contract || String(contract.client) !== userId) return null;

      const project = contract.project as unknown as { _id: unknown; title: string };
      const returnPath = `/projects/${String(project._id)}`;
      const isConcept = purpose === PaymentPurpose.CONTRACT_CONCEPT_FEE;

      const needed = isConcept
        ? ContractStatus.AWAITING_CONCEPT_FEE
        : ContractStatus.AWAITING_ESCROW;
      return {
        amountBdt: isConcept ? contract.conceptFeeBdt : contract.designFeeBdt,
        label: `${isConcept ? "Concept fee" : "Design fee (escrow)"} — ${project.title}`,
        category: "design-services",
        returnPath,
        blocked:
          contract.status === needed
            ? undefined
            : isConcept
              ? "The concept fee has already been paid"
              : "The design escrow is already funded",
      };
    }

    case PaymentPurpose.STRUCTURAL_ESCROW: {
      const engagement = await StructuralEngagement.findById(refId).populate({
        path: "project",
        select: "title",
      });
      if (!engagement || String(engagement.client) !== userId) return null;

      const project = engagement.project as unknown as { _id: unknown; title: string };
      return {
        amountBdt: engagement.feeBdt,
        label: `Structural engineering fee (escrow) — ${project.title}`,
        category: "engineering-services",
        returnPath: `/projects/${String(project._id)}`,
        blocked:
          engagement.status === StructuralStatus.AWAITING_ESCROW
            ? undefined
            : "This engagement is already funded",
      };
    }

    case PaymentPurpose.MARKET_ORDER: {
      const order = await MarketOrder.findById(refId);
      if (!order || String(order.buyer) !== userId) return null;
      return {
        amountBdt: order.totalBdt,
        label: `${order.productSnapshot.name} × ${order.quantity}`,
        category: "construction-materials",
        returnPath: "/marketplace/orders",
        blocked: order.paidAt
          ? "This order is already paid"
          : order.status === OrderStatus.CANCELLED
            ? "This order was cancelled"
            : undefined,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Applies a confirmed payment to whatever it was for. Runs at most once per
 * session — the `appliedAt` guard is set before the work, so a second callback
 * arriving mid-flight finds it already claimed.
 *
 * Uses a conditional update rather than a read-then-write: two callbacks can
 * arrive milliseconds apart, and `findOneAndUpdate` with `appliedAt: null` in
 * the filter is atomic where an `if (!doc.appliedAt)` check is not.
 */
async function settle(session: HydratedDocument<PaymentSessionDoc>): Promise<void> {
  const claimed = await PaymentSession.findOneAndUpdate(
    { _id: session._id, appliedAt: null },
    { $set: { appliedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!claimed) return; // Another callback already settled this one.

  const ledgerEntry = {
    amountBdt: session.amountBdt,
    method: PaymentMethod.SSLCOMMERZ,
    reference: session.bankTranId ?? session.tranId,
    at: new Date(),
  };

  switch (session.purpose) {
    case PaymentPurpose.CONTRACT_CONCEPT_FEE: {
      const contract = await Contract.findById(session.refId);
      if (!contract || contract.status !== ContractStatus.AWAITING_CONCEPT_FEE) return;
      contract.payments.push({ kind: PaymentKind.CONCEPT_FEE, ...ledgerEntry });
      contract.status = ContractStatus.CONCEPT_IN_PROGRESS;
      await contract.save();
      await notify(String(contract.architect), {
        type: NotificationType.PAYMENT,
        title: "Concept fee received",
        body: `৳${contract.conceptFeeBdt.toLocaleString("en-BD")} paid — you can start the concept brief.`,
        link: `/projects/${String(contract.project)}`,
      });
      return;
    }

    case PaymentPurpose.CONTRACT_ESCROW: {
      const contract = await Contract.findById(session.refId);
      if (!contract || contract.status !== ContractStatus.AWAITING_ESCROW) return;
      contract.payments.push({ kind: PaymentKind.ESCROW_DEPOSIT, ...ledgerEntry });
      contract.status = ContractStatus.DESIGN_IN_PROGRESS;
      await contract.save();
      await notify(String(contract.architect), {
        type: NotificationType.PAYMENT,
        title: "Design fee is in escrow",
        body: `৳${contract.designFeeBdt.toLocaleString("en-BD")} is held. You can start the design.`,
        link: `/projects/${String(contract.project)}`,
      });
      return;
    }

    case PaymentPurpose.STRUCTURAL_ESCROW: {
      const engagement = await StructuralEngagement.findById(session.refId);
      if (!engagement || engagement.status !== StructuralStatus.AWAITING_ESCROW) return;
      engagement.payments.push({ kind: PaymentKind.ESCROW_DEPOSIT, ...ledgerEntry });
      engagement.status = StructuralStatus.DRAWINGS_IN_PROGRESS;
      await engagement.save();
      await notify(String(engagement.engineer), {
        type: NotificationType.PAYMENT,
        title: "Structural fee is in escrow",
        body: `৳${engagement.feeBdt.toLocaleString("en-BD")} is held. You can start submitting drawings.`,
        link: `/projects/${String(engagement.project)}`,
      });
      return;
    }

    case PaymentPurpose.MARKET_ORDER: {
      const order = await MarketOrder.findById(session.refId);
      if (!order || order.paidAt) return;
      order.paidAt = new Date();
      order.paymentRef = session.bankTranId ?? session.tranId;
      await order.save();
      await notify(String(order.seller), {
        type: NotificationType.PAYMENT,
        title: "Order paid",
        body: `৳${order.totalBdt.toLocaleString("en-BD")} received for ${order.productSnapshot.name}.`,
        link: "/marketplace/orders",
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** GET /api/payments/config — can this server take gateway payments? */
export function getConfig(_req: Request, res: Response) {
  return res.json({
    data: {
      configured: isGatewayConfigured(),
      sandbox: env.SSLCZ_SANDBOX,
    } satisfies PaymentConfig,
  });
}

const checkoutSchema = z.object({
  purpose: z.enum(PaymentPurpose, { message: "Unknown payment purpose" }),
  refId: z.string().min(1, "Missing reference"),
});

/** POST /api/payments/checkout — open a gateway session and hand back its URL. */
export async function startCheckout(req: Request, res: Response) {
  // Validate the request before checking whether the server can take payments.
  // A caller asking to pay for something that isn't theirs, or isn't due,
  // should hear that regardless of how this server happens to be configured —
  // and it's what makes these guards testable without live store credentials.
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { purpose, refId } = parsed.data;
  if (!isValidObjectId(refId)) {
    return res.status(400).json({ error: { message: "Invalid reference" } });
  }

  const payable = await describe(purpose, refId, req.auth!.sub);
  if (!payable) return res.status(404).json({ error: { message: "Nothing to pay for here" } });
  if (payable.blocked) return res.status(400).json({ error: { message: payable.blocked } });

  // SSLCommerz refuses anything outside this band, so say so plainly rather
  // than letting the gateway reject it with its own wording.
  if (payable.amountBdt < SSLCOMMERZ_MIN_BDT) {
    return res.status(400).json({
      error: { message: `Online payment starts at ৳${SSLCOMMERZ_MIN_BDT}` },
    });
  }
  if (payable.amountBdt > SSLCOMMERZ_MAX_BDT) {
    return res.status(400).json({
      error: {
        message: `Online payment is capped at ৳${SSLCOMMERZ_MAX_BDT.toLocaleString("en-BD")} per transaction — pay this one by bank transfer and record it manually`,
      },
    });
  }

  if (!isGatewayConfigured()) {
    return res
      .status(503)
      .json({ error: { message: "Online payment isn't configured on this server yet" } });
  }

  const payer = await User.findById(req.auth!.sub).select("name email phone");
  if (!payer) return res.status(401).json({ error: { message: "Authentication required" } });

  // Unique per store, forever — a timestamp plus real randomness.
  const tranId = `BLD-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

  const session = await PaymentSession.create({
    purpose,
    refId,
    payer: req.auth!.sub,
    amountBdt: payable.amountBdt,
    tranId,
    returnPath: payable.returnPath,
  });

  const base = `${env.API_BASE_URL}/api/payments`;
  try {
    const gatewayUrl = await createSession({
      tranId,
      amountBdt: payable.amountBdt,
      productName: payable.label,
      productCategory: payable.category,
      customer: { name: payer.name, email: payer.email, phone: payer.phone },
      successUrl: `${base}/callback/success`,
      failUrl: `${base}/callback/fail`,
      cancelUrl: `${base}/callback/cancel`,
      ipnUrl: `${base}/ipn`,
    });
    return res.json({
      data: { gatewayUrl, tranId, amountBdt: payable.amountBdt },
    });
  } catch (err) {
    session.status = PaymentSessionStatus.FAILED;
    session.failReason = err instanceof Error ? err.message : "Gateway error";
    await session.save();
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "Gateway error" } });
  }
}

/** Sends the payer back into the web app with a flag the page can read. */
function backToApp(res: Response, path: string, outcome: string, detail?: string) {
  const query = new URLSearchParams({ payment: outcome });
  if (detail) query.set("reason", detail);
  return res.redirect(`${env.WEB_BASE_URL}${path}?${query.toString()}`);
}

/**
 * POST /api/payments/callback/success — where SSLCommerz returns the payer.
 *
 * Unauthenticated by necessity: it's a cross-site form POST from the gateway,
 * carrying no session cookie or token. That's precisely why nothing here is
 * trusted — the body is used only to find our session and to read the
 * `val_id`, and the credit is authorised by the validator call.
 */
export async function callbackSuccess(req: Request, res: Response) {
  const tranId = String(req.body?.tran_id ?? req.query?.tran_id ?? "");
  const valId = String(req.body?.val_id ?? req.query?.val_id ?? "");

  const session = await PaymentSession.findOne({ tranId });
  if (!session) {
    console.error(`[payments] success callback for unknown tran_id ${tranId}`);
    return backToApp(res, "/dashboard", "error", "We couldn't find that payment");
  }
  // Already settled (the IPN beat the browser here) — just show success.
  if (session.status === PaymentSessionStatus.PAID) {
    return backToApp(res, session.returnPath, "success");
  }
  if (!valId) return backToApp(res, session.returnPath, "error", "The gateway sent no validation id");

  const result = await validate(valId);

  // Guard the three things a forged or mismatched callback would get wrong.
  if (!result.ok) {
    session.status = PaymentSessionStatus.FAILED;
    session.failReason = result.reason ?? result.status ?? "Not validated";
    await session.save();
    return backToApp(res, session.returnPath, "failed", "The gateway couldn't confirm that payment");
  }
  if (result.tranId && result.tranId !== session.tranId) {
    console.error(`[payments] tran_id mismatch: ${result.tranId} vs ${session.tranId}`);
    return backToApp(res, session.returnPath, "error", "That payment doesn't match this order");
  }
  // Never settle for less than was owed.
  if (result.amountBdt !== undefined && result.amountBdt + 0.01 < session.amountBdt) {
    console.error(`[payments] amount short: paid ${result.amountBdt} of ${session.amountBdt}`);
    session.status = PaymentSessionStatus.FAILED;
    session.failReason = `Paid ৳${result.amountBdt} of ৳${session.amountBdt}`;
    await session.save();
    return backToApp(res, session.returnPath, "failed", "The amount paid didn't match");
  }

  session.status = PaymentSessionStatus.PAID;
  session.valId = valId;
  session.bankTranId = result.bankTranId;
  session.channel = result.cardType;
  session.paidAt = new Date();
  await session.save();

  await settle(session);
  return backToApp(res, session.returnPath, "success");
}

/** POST /api/payments/callback/fail and /cancel — nothing moved; note and return. */
export async function callbackEnded(req: Request, res: Response) {
  const cancelled = req.path.endsWith("cancel");
  const tranId = String(req.body?.tran_id ?? req.query?.tran_id ?? "");
  const session = await PaymentSession.findOne({ tranId });
  if (!session) return backToApp(res, "/dashboard", cancelled ? "cancelled" : "failed");

  // Don't overwrite a payment that already succeeded.
  if (session.status === PaymentSessionStatus.INITIATED) {
    session.status = cancelled ? PaymentSessionStatus.CANCELLED : PaymentSessionStatus.FAILED;
    session.failReason = cancelled ? "Cancelled by the payer" : String(req.body?.error ?? "Failed at the gateway");
    await session.save();
  }
  return backToApp(res, session.returnPath, cancelled ? "cancelled" : "failed");
}

/**
 * POST /api/payments/ipn — SSLCommerz's server-to-server notification.
 *
 * The reliable half of the pair: it arrives even if the payer closes their
 * browser on the gateway's page. Same validation, same idempotent settlement,
 * and it answers in plain text because nobody is reading the response.
 */
export async function handleIpn(req: Request, res: Response) {
  const tranId = String(req.body?.tran_id ?? "");
  const valId = String(req.body?.val_id ?? "");
  if (!tranId || !valId) return res.status(400).send("missing tran_id or val_id");

  const session = await PaymentSession.findOne({ tranId });
  if (!session) return res.status(404).send("unknown transaction");
  if (session.status === PaymentSessionStatus.PAID) return res.send("already settled");

  const result = await validate(valId);
  if (!result.ok) {
    session.status = PaymentSessionStatus.FAILED;
    session.failReason = result.reason ?? result.status ?? "Not validated";
    await session.save();
    return res.send("not valid");
  }
  if (result.amountBdt !== undefined && result.amountBdt + 0.01 < session.amountBdt) {
    session.status = PaymentSessionStatus.FAILED;
    session.failReason = `Paid ৳${result.amountBdt} of ৳${session.amountBdt}`;
    await session.save();
    return res.send("amount mismatch");
  }

  session.status = PaymentSessionStatus.PAID;
  session.valId = valId;
  session.bankTranId = result.bankTranId;
  session.channel = result.cardType;
  session.paidAt = new Date();
  await session.save();

  await settle(session);
  return res.send("ok");
}
