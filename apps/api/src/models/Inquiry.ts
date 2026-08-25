import { Schema, model, Types } from "mongoose";
import { InquiryStatus } from "@buildora/shared";

/**
 * A land owner's contact request to a professional (architect, structural
 * engineer, or contractor). The starting point of the "find and contact a
 * professional" journey — before any concept brief, contract, or escrow
 * exists. Status tracks how far the professional has engaged with it.
 */
export interface InquiryDoc {
  landOwner: Types.ObjectId;
  professional: Types.ObjectId;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<InquiryDoc>(
  {
    // Not indexed individually — see the compound indexes at the bottom.
    landOwner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    professional: { type: Schema.Types.ObjectId, ref: "User", required: true },
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
  { landOwner: 1, professional: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [InquiryStatus.SENT, InquiryStatus.READ, InquiryStatus.ACCEPTED] },
    },
  }
);

/**
 * `/api/inquiries/mine`, newest-first — the land owner sees the requests they
 * sent, the professional the ones they received.
 *
 * The unique index above starts with `landOwner` too, but it cannot serve this:
 * it is partial, so it omits declined inquiries that the list must still show,
 * and its second field is `professional` rather than `createdAt`, so the sort
 * would still happen in memory.
 */
inquirySchema.index({ landOwner: 1, createdAt: -1 });
inquirySchema.index({ professional: 1, createdAt: -1 });

export const Inquiry = model<InquiryDoc>("Inquiry", inquirySchema);
