import { Schema, model } from "mongoose";
import { BuildingType, UserRole, VerificationStatus, type UserProfile } from "@buildora/shared";

/**
 * A user is a land owner or a professional (architect/engineer/contractor/
 * supplier); `role` says which. `profile` holds whichever profile shape fits
 * that role — the land owner's build details or the professional's credentials.
 * Verification documents and badge fields arrive with the verification feature
 * (roadmap step 3).
 */
export interface UserDoc {
  name: string;
  username: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  profile?: UserProfile;
  createdAt: Date;
  updatedAt: Date;
}

// Structured sections of a professional's profile. `_id: false` on each —
// they're embedded lists edited as a whole, not standalone documents.
const educationSchema = new Schema(
  {
    degree: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    year: { type: Number, min: 1950, max: 2100 },
    certificateUrl: { type: String, trim: true },
  },
  { _id: false }
);

const achievementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    year: { type: Number, min: 1950, max: 2100 },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const portfolioProjectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    year: { type: Number, min: 1950, max: 2100 },
    location: { type: String, trim: true },
    imageUrls: { type: [String], default: [] },
  },
  { _id: false }
);

// Nested profile subdocument, shared across roles: land-owner build fields and
// professional credential fields both live here (only the ones relevant to the
// user's role get populated). `_id: false` — it's part of the user, not its
// own collection document.
const profileSchema = new Schema<UserProfile>(
  {
    // Common
    avatarUrl: { type: String, trim: true },
    company: { type: String, trim: true },
    bio: { type: String, trim: true },
    // Land owner
    nid: { type: String, trim: true },
    landAreaKatha: { type: Number, min: 0 },
    buildingType: { type: String, enum: Object.values(BuildingType) },
    budgetMinBdt: { type: Number, min: 0 },
    budgetMaxBdt: { type: Number, min: 0 },
    floors: { type: Number, min: 0 },
    // Professional
    licenseAuthority: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    specialties: { type: String, trim: true },
    yearsExperience: { type: Number, min: 0 },
    website: { type: String, trim: true },
    // `default: undefined` keeps empty arrays out of land-owner documents.
    education: { type: [educationSchema], default: undefined },
    achievements: { type: [achievementSchema], default: undefined },
    portfolio: { type: [portfolioProjectSchema], default: undefined },
  },
  { _id: false }
);

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    // Chosen once at signup; unique and never updated (no setter path exists).
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, immutable: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING_VERIFICATION,
    },
    profile: { type: profileSchema, default: undefined },
  },
  { timestamps: true }
);

export const User = model<UserDoc>("User", userSchema);
