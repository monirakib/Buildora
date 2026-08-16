import { Schema, model, Types } from "mongoose";
import { protectLedger, type LedgerProtected } from "../services/ledgerIntegrity";
import {
  ContractStatus,
  DeliverableKind,
  DeliverableStatus,
  DESIGN_REVISION_ROUNDS,
  DEFAULT_COMMISSION_RATE,
  PaymentKind,
  PaymentMethod,
} from "@buildora/shared";

/** One ledger entry — payments are sandbox-simulated (no real gateway keys). */
export interface PaymentEntryDoc {
  kind: PaymentKind;
  amountBdt: number;
  method?: PaymentMethod;
  reference?: string;
  at: Date;
}

/** A concept or design submission the client reviews. */
export interface DeliverableDoc {
  title: string;
  note?: string;
  fileUrl?: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  clientNote?: string;
  submittedAt: Date;
  decidedAt?: Date;
}

/**
 * The design contract created when a proposal is accepted (plan §4.1 steps
 * 04–07): concept fee → concept review → escrow deposit → design with ≤3
 * revision rounds → approval releases the escrow minus platform commission.
 */
export interface ContractDoc extends LedgerProtected {
  project: Types.ObjectId;
  client: Types.ObjectId;
  architect: Types.ObjectId;
  status: ContractStatus;
  conceptFeeBdt: number;
  designFeeBdt: number;
  commissionRate: number;
  revisionsUsed: number;
  maxRevisions: number;
  payments: PaymentEntryDoc[];
  deliverables: DeliverableDoc[];
  commissionBdt?: number;
  releasedToArchitectBdt?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Embedded ledger entries and deliverables are edited through contract
// actions, never standalone — hence `_id: false`.
const paymentSchema = new Schema<PaymentEntryDoc>(
  {
    kind: { type: String, enum: Object.values(PaymentKind), required: true },
    amountBdt: { type: Number, required: true, min: 0 },
    method: { type: String, enum: Object.values(PaymentMethod) },
    reference: { type: String, trim: true, maxlength: 60 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deliverableSchema = new Schema<DeliverableDoc>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 1000 },
    fileUrl: { type: String, trim: true },
    kind: { type: String, enum: Object.values(DeliverableKind), required: true },
    status: {
      type: String,
      enum: Object.values(DeliverableStatus),
      default: DeliverableStatus.PENDING_REVIEW,
    },
    clientNote: { type: String, trim: true, maxlength: 1000 },
    submittedAt: { type: Date, default: Date.now },
    decidedAt: { type: Date },
  },
  { _id: false }
);

const contractSchema = new Schema<ContractDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: Object.values(ContractStatus),
      default: ContractStatus.AWAITING_CONCEPT_FEE,
    },
    conceptFeeBdt: { type: Number, required: true, min: 0 },
    designFeeBdt: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, default: DEFAULT_COMMISSION_RATE, min: 0, max: 1 },
    revisionsUsed: { type: Number, default: 0, min: 0 },
    maxRevisions: { type: Number, default: DESIGN_REVISION_ROUNDS, min: 0 },
    payments: { type: [paymentSchema], default: [] },
    deliverables: { type: [deliverableSchema], default: [] },
    commissionBdt: { type: Number, min: 0 },
    releasedToArchitectBdt: { type: Number, min: 0 },
  },
  { timestamps: true }
);

/** The design-contract ledger: concept fee, escrow, and what left it. */
protectLedger(contractSchema, (doc) => ({
  conceptFeeBdt: doc.conceptFeeBdt,
  designFeeBdt: doc.designFeeBdt,
  commissionRate: doc.commissionRate,
  commissionBdt: doc.commissionBdt,
  releasedToArchitectBdt: doc.releasedToArchitectBdt,
  status: doc.status,
  payments: (doc.payments as { kind: string; amountBdt: number; at?: Date }[] | undefined)?.map(
    (p) => `${p.kind}:${p.amountBdt}:${p.at ? new Date(p.at).toISOString() : ""}`
  ),
}));

/**
 * `listMyContracts` matches `{ $or: [{ client: me }, { architect: me }] }` and
 * sorts newest-first.
 *
 * An `$or` is planned as one lookup per branch whose results are merged, so each
 * branch needs its own index — hence two, not one compound. Both end in
 * `createdAt` so each branch comes back already ordered and the merge has less
 * to do.
 */
contractSchema.index({ client: 1, createdAt: -1 });
contractSchema.index({ architect: 1, createdAt: -1 });

export const Contract = model<ContractDoc>("Contract", contractSchema);
