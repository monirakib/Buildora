import { Schema, model, Types } from "mongoose";
import { PaymentPurpose, PaymentSessionStatus } from "@buildora/shared";
import { protectLedger, type LedgerProtected } from "../services/ledgerIntegrity";

/**
 * One attempt at paying for one thing through SSLCommerz.
 *
 * Kept as its own collection rather than as fields on the contract/order for
 * two reasons. First, a payment can be attempted, abandoned and retried — the
 * domain object only cares about the attempt that succeeded, but reconciliation
 * needs all of them. Second, it gives the gateway callback a single row to look
 * up by `tranId` without knowing or caring what kind of thing is being paid
 * for; `purpose` and `refId` are what it uses afterwards to settle the right
 * object.
 *
 * `appliedAt` is the idempotency guard. SSLCommerz can tell us a payment
 * succeeded twice — once when the payer's browser returns, once over IPN,
 * server to server — and crediting an escrow twice would be a real financial
 * bug. Settlement only ever runs when this field is unset.
 */
export interface PaymentSessionDoc extends LedgerProtected {
  purpose: PaymentPurpose;
  refId: Types.ObjectId;
  payer: Types.ObjectId;
  amountBdt: number;
  /** Our reference, sent to the gateway as tran_id. Unique. */
  tranId: string;
  status: PaymentSessionStatus;
  /** SSLCommerz's validation id, from the callback. */
  valId?: string;
  /** Their transaction reference, for reconciliation against a statement. */
  bankTranId?: string;
  /** The channel the payer actually chose, e.g. "bKash", "VISA-Dutch Bangla". */
  channel?: string;
  failReason?: string;
  /**
   * Where in the web app to send the payer back to. Worked out when the session
   * is created, because the gateway's callback lands on the API with nothing
   * but a transaction id — it has no idea which page the payer came from.
   */
  returnPath: string;
  /** Set the moment settlement runs. Nothing settles twice — see above. */
  appliedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSessionSchema = new Schema<PaymentSessionDoc>(
  {
    purpose: { type: String, enum: Object.values(PaymentPurpose), required: true },
    refId: { type: Schema.Types.ObjectId, required: true, index: true },
    payer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountBdt: { type: Number, required: true, min: 0 },
    // No `index: true` here — the unique index below covers the same key, and
    // declaring both makes Mongoose build the plain one and skip the unique.
    tranId: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: Object.values(PaymentSessionStatus),
      default: PaymentSessionStatus.INITIATED,
      required: true,
    },
    valId: { type: String, trim: true },
    bankTranId: { type: String, trim: true },
    channel: { type: String, trim: true },
    failReason: { type: String, trim: true, maxlength: 300 },
    returnPath: { type: String, required: true, trim: true },
    appliedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * The gateway's side of the story. `appliedAt` is in here because it is the
 * idempotency latch that stops one payment being credited twice — clearing it
 * in the database would let a settled session be replayed.
 */
protectLedger(paymentSessionSchema, (doc) => ({
  tranId: doc.tranId,
  purpose: doc.purpose,
  refId: String(doc.refId),
  amountBdt: doc.amountBdt,
  status: doc.status,
  appliedAt: doc.appliedAt,
  valId: doc.valId,
}));

export const PaymentSession = model<PaymentSessionDoc>("PaymentSession", paymentSessionSchema);
