import { Schema, model, Types } from "mongoose";
import { InquiryStatus } from "@buildora/shared";

/**
 * A land owner's contact request to a professional (an architect, for now).
 * The starting point of the "find and contact a professional" journey — before
 * any concept brief, contract, or escrow exists. Status tracks how far the
 * professional has engaged with it.
 */
export interface InquiryDoc {
  landOwner: Types.ObjectId;
  architect: Types.ObjectId;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<InquiryDoc>(
  {
    landOwner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: Object.values(InquiryStatus),
      default: InquiryStatus.SENT,
    },
  },
  { timestamps: true }
);

// A land owner can't have two live requests to the same professional. Once a
// request is DECLINED they may send a fresh one, so the uniqueness only applies
// to still-open inquiries (partial index on the non-declined states).
inquirySchema.index(
  { landOwner: 1, architect: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [InquiryStatus.SENT, InquiryStatus.READ, InquiryStatus.ACCEPTED] },
    },
  }
);

export const Inquiry = model<InquiryDoc>("Inquiry", inquirySchema);
