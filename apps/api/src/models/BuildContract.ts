import { Schema, model, Types } from "mongoose";
import { protectLedger, type LedgerProtected } from "../services/ledgerIntegrity";
import {
  BuildContractStatus,
  DEFAULT_COMMISSION_RATE,
  PaymentKind,
  PaymentMethod,
} from "@buildora/shared";

/**
 * The construction contract created when a bid is awarded.
 *
 * Deliberately a third contract model alongside Contract (design) and
 * StructuralEngagement, for the reason StructuralEngagement's own header gives:
 * the flows rhyme but differ where it matters. The difference here is the
 * money. A design fee is escrowed once and released once; a build is escrowed
 * and released **per milestone**, so an owner is never holding a year of
 * construction cost against work that hasn't started. That schedule lives in
 * the Milestone collection, and this document only carries the agreed sum, the
 * commission rate, and the ledger of what has actually moved.
 */
export interface PaymentEntryDoc {
  kind: PaymentKind;
  amountBdt: number;
  method?: PaymentMethod;
  reference?: string;
  at: Date;
}

export interface BuildContractDoc extends LedgerProtected {
  project: Types.ObjectId;
  tender: Types.ObjectId;
  bid: Types.ObjectId;
  client: Types.ObjectId;
  contractor: Types.ObjectId;
  /** Copied from the project at award time — the engineer who signs off work. */
  engineer?: Types.ObjectId;
  status: BuildContractStatus;
  contractSumBdt: number;
  timelineWeeks: number;
  commissionRate: number;
  payments: PaymentEntryDoc[];
  releasedToContractorBdt: number;
  commissionBdt: number;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

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

const buildContractSchema = new Schema<BuildContractDoc>(
  {
    // Covered by the unique partial index below.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    tender: { type: Schema.Types.ObjectId, ref: "Tender", required: true },
    bid: { type: Schema.Types.ObjectId, ref: "Bid", required: true },
    // Not indexed individually — the compound indexes at the bottom lead with
    // these and cover the sort too.
    client: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contractor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    engineer: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: Object.values(BuildContractStatus),
      default: BuildContractStatus.ACTIVE,
      required: true,
    },
    contractSumBdt: { type: Number, required: true, min: 0 },
    timelineWeeks: { type: Number, required: true, min: 1 },
    commissionRate: { type: Number, default: DEFAULT_COMMISSION_RATE, min: 0, max: 1 },
    payments: { type: [paymentSchema], default: [] },
    releasedToContractorBdt: { type: Number, default: 0, min: 0 },
    commissionBdt: { type: Number, default: 0, min: 0 },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

/** One live build contract per project; a cancelled one frees the project up. */
buildContractSchema.index(
  { project: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [BuildContractStatus.ACTIVE, BuildContractStatus.COMPLETED] },
    },
  }
);

/**
 * The construction escrow ledger — the largest sums on the platform, and the
 * record an attacker with database access would most want to edit.
 */
protectLedger(buildContractSchema, (doc) => ({
  contractSumBdt: doc.contractSumBdt,
  releasedToContractorBdt: doc.releasedToContractorBdt,
  commissionBdt: doc.commissionBdt,
  commissionRate: doc.commissionRate,
  status: doc.status,
  contractor: String(doc.contractor),
  client: String(doc.client),
  // Each entry reduced to what it means financially, so the tag doesn't churn
  // on incidental subdocument fields Mongoose may add.
  payments: (doc.payments as { kind: string; amountBdt: number; at?: Date }[] | undefined)?.map(
    (p) => `${p.kind}:${p.amountBdt}:${p.at ? new Date(p.at).toISOString() : ""}`
  ),
}));

/**
 * `/api/build/mine` matches `{ $or: [{client}, {contractor}, {engineer}] }`,
 * newest-first, so each of the three branches gets its own index.
 *
 * `engineer` had no index at all before this — the field was added later than
 * the other two and the `$or` branch was never given one, so that branch of
 * every query scanned the collection.
 */
buildContractSchema.index({ client: 1, createdAt: -1 });
buildContractSchema.index({ contractor: 1, createdAt: -1 });
buildContractSchema.index({ engineer: 1, createdAt: -1 });

export const BuildContract = model<BuildContractDoc>("BuildContract", buildContractSchema);
