import { Schema, model, Types } from "mongoose";
import { protectLedger, type LedgerProtected } from "../services/ledgerIntegrity";
import {
  DEFAULT_COMMISSION_RATE,
  DESIGN_REVISION_ROUNDS,
  DeliverableStatus,
  PaymentKind,
  PaymentMethod,
  StructuralStatus,
} from "@buildora/shared";

/**
 * A land owner's engagement of a structural engineer on one project.
 *
 * Deliberately a separate collection rather than a variant of Contract. The two
 * flows rhyme — escrow in, deliverables, review rounds, release on approval —
 * but the design contract carries a concept-brief stage that means nothing for
 * structural work, and widening `Contract.architect` into a generic
 * `professional` would have meant touching a payment flow that already works.
 * A second small model is cheaper to read and impossible to break the first
 * one with.
 *
 * Payments are sandbox-simulated, exactly as in Contract — there are no real
 * gateway keys in this project.
 */
export interface PaymentEntryDoc {
  kind: PaymentKind;
  amountBdt: number;
  method?: PaymentMethod;
  reference?: string;
  at: Date;
}

/** One submitted drawing set, stamped by the engineer who sent it. */
export interface StructuralSubmissionDoc {
  title: string;
  note?: string;
  fileUrl: string;
  status: DeliverableStatus;
  signature: string;
  submittedAt: Date;
  clientNote?: string;
  architectNote?: string;
  decidedAt?: Date;
}

export interface StructuralEngagementDoc extends LedgerProtected {
  project: Types.ObjectId;
  client: Types.ObjectId;
  engineer: Types.ObjectId;
  status: StructuralStatus;
  feeBdt: number;
  commissionRate: number;
  revisionsUsed: number;
  maxRevisions: number;
  payments: PaymentEntryDoc[];
  submissions: StructuralSubmissionDoc[];
  commissionBdt?: number;
  releasedToEngineerBdt?: number;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Embedded and only ever edited through engagement actions — hence `_id: false`.
const paymentSchema = new Schema<PaymentEntryDoc>(
  {
    kind: { type: String, enum: Object.values(PaymentKind), required: true },
    amountBdt: { type: Number, required: true, min: 0 },
    method: { type: String, enum: Object.values(PaymentMethod) },
    reference: { type: String, trim: true, maxlength: 120 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const submissionSchema = new Schema<StructuralSubmissionDoc>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 1000 },
    fileUrl: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(DeliverableStatus),
      default: DeliverableStatus.PENDING_REVIEW,
      required: true,
    },
    // Typed by the engineer at submission — their stamp on this drawing set.
    signature: { type: String, required: true, trim: true, maxlength: 120 },
    submittedAt: { type: Date, default: Date.now },
    clientNote: { type: String, trim: true, maxlength: 1000 },
    architectNote: { type: String, trim: true, maxlength: 1000 },
    decidedAt: { type: Date },
  },
  { _id: false }
);

const structuralEngagementSchema = new Schema<StructuralEngagementDoc>(
  {
    // Deliberately no `index: true` here — the unique partial index declared at
    // the bottom of this file covers the same key. Declaring both makes Mongoose
    // build the plain one and silently skip the unique one, which quietly
    // removes the guarantee this model depends on.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    client: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    engineer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: Object.values(StructuralStatus),
      default: StructuralStatus.AWAITING_ESCROW,
      required: true,
    },
    feeBdt: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, default: DEFAULT_COMMISSION_RATE, min: 0, max: 1 },
    revisionsUsed: { type: Number, default: 0, min: 0 },
    maxRevisions: { type: Number, default: DESIGN_REVISION_ROUNDS, min: 0 },
    payments: { type: [paymentSchema], default: [] },
    submissions: { type: [submissionSchema], default: [] },
    commissionBdt: { type: Number, min: 0 },
    releasedToEngineerBdt: { type: Number, min: 0 },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

/** The statuses that mean "this engagement is still live". */
export const LIVE_STRUCTURAL_STATUSES = [
  StructuralStatus.AWAITING_ESCROW,
  StructuralStatus.DRAWINGS_IN_PROGRESS,
];

/**
 * A project can only have one engineer engaged at a time. Cancelled and
 * completed engagements are excluded, so an owner whose engineer dropped out
 * can appoint a replacement.
 */
structuralEngagementSchema.index(
  { project: 1 },
  { unique: true, partialFilterExpression: { status: { $in: LIVE_STRUCTURAL_STATUSES } } }
);

// "My engagements, newest first", for either side.
structuralEngagementSchema.index({ engineer: 1, createdAt: -1 });
structuralEngagementSchema.index({ client: 1, createdAt: -1 });

/** The engineer's escrow ledger — same shape as the design contract's. */
protectLedger(structuralEngagementSchema, (doc) => ({
  feeBdt: doc.feeBdt,
  commissionRate: doc.commissionRate,
  commissionBdt: doc.commissionBdt,
  releasedToEngineerBdt: doc.releasedToEngineerBdt,
  status: doc.status,
  payments: (doc.payments as { kind: string; amountBdt: number; at?: Date }[] | undefined)?.map(
    (p) => `${p.kind}:${p.amountBdt}:${p.at ? new Date(p.at).toISOString() : ""}`
  ),
}));

export const StructuralEngagement = model<StructuralEngagementDoc>(
  "StructuralEngagement",
  structuralEngagementSchema
);
