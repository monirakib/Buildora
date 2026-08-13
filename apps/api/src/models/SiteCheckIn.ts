import { Schema, model, type Types } from "mongoose";
import { LabourTrade } from "@buildora/shared";

/**
 * One attendance record: a trade, a headcount, and where the phone was.
 *
 * The site diary already holds a daily headcount, but it's typed from memory at
 * the end of the day. This is the same number captured as it happens, on the
 * plot, which is why every record carries coordinates and its distance from the
 * pin. An off-site record is stored rather than refused — see `onSite`.
 */
export interface SiteCheckInDoc {
  project: Types.ObjectId;
  /** Dhaka-time date, "YYYY-MM-DD". Attendance is counted per day. */
  date: string;
  recordedBy: Types.ObjectId;
  trade: LabourTrade;
  count: number;
  lat: number;
  lng: number;
  distanceFromPlotM?: number;
  /**
   * Whether the phone was inside the site radius. Deliberately a flag rather
   * than a rejection: GPS is wrong often enough that refusing would punish
   * people who really are standing there, and a supervisor reading the day can
   * weigh it themselves.
   */
  onSite: boolean;
  note?: string;
  checkedInAt: Date;
  checkedOutAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const siteCheckInSchema = new Schema<SiteCheckInDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    date: { type: String, required: true, index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    trade: { type: String, enum: Object.values(LabourTrade), required: true },
    count: { type: Number, required: true, min: 1, max: 2000 },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    distanceFromPlotM: { type: Number, min: 0 },
    onSite: { type: Boolean, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    checkedInAt: { type: Date, default: Date.now },
    checkedOutAt: { type: Date },
  },
  { timestamps: true }
);

// The day view is the hot read: every check-in on one project on one date.
siteCheckInSchema.index({ project: 1, date: 1 });

export const SiteCheckIn = model<SiteCheckInDoc>("SiteCheckIn", siteCheckInSchema);
