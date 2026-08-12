import { Schema, model, Types } from "mongoose";
import { LabourTrade, WeatherSource } from "@buildora/shared";

/**
 * One day's site diary entry on a project.
 *
 * The record a site supervisor keeps: what got built, who turned up, what
 * materials went in, and what held things up. Exactly one entry per project per
 * Dhaka calendar day, enforced by the unique index at the bottom — a site has
 * one day's work, not several competing accounts of it.
 *
 * `date` is a plain "YYYY-MM-DD" string rather than a Date. A diary entry is
 * about a calendar day in Dhaka, not an instant, and storing it as a Date would
 * invite exactly the bug where a server in another timezone files an entry
 * against yesterday.
 */

/** How many people of one trade were on site. */
export interface LabourCountDoc {
  trade: LabourTrade;
  count: number;
}

/** One material consumed, in whatever unit the site quotes it in. */
export interface MaterialUsedDoc {
  item: string;
  quantity: number;
  unit: string;
}

/** The weather over the plot that day, frozen at the time of writing. */
export interface WeatherSnapshotDoc {
  tempMaxC: number;
  tempMinC: number;
  rainfallMm: number;
  windMaxKph: number;
  weatherCode: number;
  description: string;
  source: WeatherSource;
  fetchedAt: Date;
}

export interface SiteDiaryEntryDoc {
  project: Types.ObjectId;
  author: Types.ObjectId;
  date: string;
  workDone: string;
  labour: LabourCountDoc[];
  materials: MaterialUsedDoc[];
  equipment?: string;
  issues?: string;
  photoUrls: string[];
  weather?: WeatherSnapshotDoc;
  /**
   * Frozen at write time from the day's rainfall. Denormalised rather than
   * derived on read so the rain-day tally can be counted by the database in one
   * query, and so a later change to the threshold cannot silently rewrite
   * history that a delay claim already rests on.
   */
  isRainDay: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// All three are edited only through diary actions, never standalone.
const labourSchema = new Schema<LabourCountDoc>(
  {
    trade: { type: String, enum: Object.values(LabourTrade), required: true },
    count: { type: Number, required: true, min: 0, max: 2000 },
  },
  { _id: false }
);

const materialSchema = new Schema<MaterialUsedDoc>(
  {
    item: { type: String, required: true, trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { _id: false }
);

const weatherSchema = new Schema<WeatherSnapshotDoc>(
  {
    tempMaxC: { type: Number, required: true },
    tempMinC: { type: Number, required: true },
    rainfallMm: { type: Number, required: true, min: 0 },
    windMaxKph: { type: Number, required: true, min: 0 },
    weatherCode: { type: Number, required: true },
    description: { type: String, required: true, trim: true, maxlength: 60 },
    source: { type: String, enum: Object.values(WeatherSource), required: true },
    fetchedAt: { type: Date, required: true },
  },
  { _id: false }
);

const siteDiaryEntrySchema = new Schema<SiteDiaryEntryDoc>(
  {
    // No `index: true` here — the unique compound index below covers this key.
    // Declaring both makes Mongoose build the plain one and skip the unique one,
    // which quietly removes the one-entry-per-day guarantee.
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must look like YYYY-MM-DD"],
    },
    workDone: { type: String, required: true, trim: true, maxlength: 3000 },
    labour: { type: [labourSchema], default: [] },
    materials: { type: [materialSchema], default: [] },
    equipment: { type: String, trim: true, maxlength: 300 },
    issues: { type: String, trim: true, maxlength: 2000 },
    photoUrls: { type: [String], default: [] },
    weather: { type: weatherSchema, default: undefined },
    isRainDay: { type: Boolean, default: false, required: true },
  },
  { timestamps: true }
);

/** One entry per project per day. */
siteDiaryEntrySchema.index({ project: 1, date: 1 }, { unique: true });

export const SiteDiaryEntry = model<SiteDiaryEntryDoc>("SiteDiaryEntry", siteDiaryEntrySchema);
