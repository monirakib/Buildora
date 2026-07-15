import { Schema, model, Types } from "mongoose";

/** A note written when a step was completed, kept as an audit trail. */
export interface EcpsHistoryEntryDoc {
  stepOrder: number;
  note?: string;
  at: Date;
}

/**
 * A project's progress through the ECPS steps (the platform tracks the RAJUK
 * process; it does not replace ECPS). One application per project; advancing
 * records the finished step in `history` and moves `currentStepOrder` to the
 * next step until the last one completes the application.
 */
export interface EcpsApplicationDoc {
  project: Types.ObjectId;
  currentStepOrder: number;
  completed: boolean;
  history: EcpsHistoryEntryDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const historyEntrySchema = new Schema<EcpsHistoryEntryDoc>(
  {
    stepOrder: { type: Number, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ecpsApplicationSchema = new Schema<EcpsApplicationDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    currentStepOrder: { type: Number, required: true, min: 1 },
    completed: { type: Boolean, default: false },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const EcpsApplication = model<EcpsApplicationDoc>("EcpsApplication", ecpsApplicationSchema);
