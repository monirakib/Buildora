import { Schema, model, Types } from "mongoose";
import { PermitApplicationStatus, PermitType } from "@buildora/shared";

/** One uploaded file, matched to a checklist item (see permitChecklists.ts) by `key`. */
export interface PermitDocumentDoc {
  key: string;
  name: string;
  fileUrl: string;
  uploadedAt: Date;
}

/**
 * A user's self-reported RAJUK permit application for one project. Buildora
 * has no RAJUK integration — this tracks progress the user tells us about
 * (their real application/permit number, submitted documents) and lets an
 * admin manually confirm it against what they were shown.
 */
export interface PermitApplicationDoc {
  project: Types.ObjectId;
  permitType: PermitType;
  status: PermitApplicationStatus;
  referenceNumber?: string;
  submittedDate?: Date;
  approvedDate?: Date;
  verifiedByAdmin: boolean;
  verifiedAt?: Date;
  verificationNote?: string;
  documents: PermitDocumentDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const permitDocumentSchema = new Schema<PermitDocumentDoc>(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    fileUrl: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const permitApplicationSchema = new Schema<PermitApplicationDoc>(
  {
    // Covered by the {project, permitType} unique index below.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    permitType: { type: String, enum: Object.values(PermitType), required: true },
    status: {
      type: String,
      enum: Object.values(PermitApplicationStatus),
      default: PermitApplicationStatus.NOT_STARTED,
    },
    referenceNumber: { type: String, trim: true, maxlength: 120 },
    submittedDate: { type: Date },
    approvedDate: { type: Date },
    verifiedByAdmin: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verificationNote: { type: String, trim: true, maxlength: 500 },
    documents: { type: [permitDocumentSchema], default: [] },
  },
  { timestamps: true }
);

/** One application per permit type per project — a Planning Permit row and a Construction Permit row. */
permitApplicationSchema.index({ project: 1, permitType: 1 }, { unique: true });

export const PermitApplication = model<PermitApplicationDoc>(
  "PermitApplication",
  permitApplicationSchema
);
