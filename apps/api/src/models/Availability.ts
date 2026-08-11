import { Schema, model, Types } from "mongoose";
import { SLOT_MINUTE_OPTIONS, type AvailabilityRule } from "@buildora/shared";

/**
 * An architect's bookable hours — one document per architect.
 *
 * Only the *rules* live here, never the individual slots. Slots are generated
 * on demand from these rules minus the meetings already booked (see
 * services/slots.ts). Materialising thousands of empty slot rows into MongoDB
 * would mean regenerating them every time an architect edited their hours, for
 * no gain — the rules are small and the maths is cheap.
 */
export interface AvailabilityDoc {
  architect: Types.ObjectId;
  slotMinutes: number;
  rules: AvailabilityRule[];
  blackoutDates: string[];
  minNoticeHours: number;
  maxAdvanceDays: number;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ruleSchema = new Schema<AvailabilityRule>(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    // Dhaka wall-clock "HH:MM". Validated against the same regex the API's zod
    // schema uses, so a bad value can't arrive through any path.
    start: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    end: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  },
  { _id: false }
);

const availabilitySchema = new Schema<AvailabilityDoc>(
  {
    architect: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    slotMinutes: { type: Number, required: true, enum: [...SLOT_MINUTE_OPTIONS], default: 60 },
    rules: { type: [ruleSchema], default: [] },
    // "YYYY-MM-DD" days the architect is unavailable regardless of the rules.
    blackoutDates: { type: [String], default: [] },
    minNoticeHours: { type: Number, default: 12, min: 0, max: 168 },
    maxAdvanceDays: { type: Number, default: 30, min: 1, max: 180 },
    // Nothing is bookable until the architect explicitly publishes — otherwise
    // the defaults would quietly start accepting meetings they never agreed to.
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Availability = model<AvailabilityDoc>("Availability", availabilitySchema);
