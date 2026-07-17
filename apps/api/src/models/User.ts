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
    department: { type: String, trim: true },
    year: { type: Number, min: 1950, max: 2100 },
    cgpa: { type: String, trim: true },
    certificateUrl: { type: String, trim: true },
    transcriptUrl: { type: String, trim: true },
  },
  { _id: false }
);

const experienceSchema = new Schema(
  {
    company: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    employmentType: { type: String, trim: true },
    // Kept as "YYYY-MM" strings straight from <input type="month">.
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true },
    isCurrent: { type: Boolean },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const skillSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      required: true,
    },
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
    buildingType: { type: String, trim: true },
    client: { type: String, trim: true },
    areaSqft: { type: Number, min: 0 },
    budgetBdt: { type: Number, min: 0 },
    role: { type: String, trim: true },
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
    // Public portfolio hero — the professional's own headline and short intro.
    portfolioTitle: { type: String, trim: true },
    portfolioIntro: { type: String, trim: true },
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
    // Identity (architect verification wizard) — supervisor-only fields,
    // excluded from the public projection in professionals.controller.
    dateOfBirth: { type: String, trim: true },
    gender: { type: String, trim: true },
    currentAddress: { type: String, trim: true },
    permanentAddress: { type: String, trim: true },
    nidFrontUrl: { type: String, trim: true },
    nidBackUrl: { type: String, trim: true },
    // Professional details
    professionalTitle: { type: String, trim: true },
    isIndependent: { type: Boolean },
    officeAddress: { type: String, trim: true },
    languages: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    // License / membership
    membershipStatus: { type: String, trim: true },
    licenseIssueDate: { type: String, trim: true },
    licenseExpiryDate: { type: String, trim: true },
    iabCertificateUrl: { type: String, trim: true },
    membershipCardUrl: { type: String, trim: true },
    rajukEnlistmentNo: { type: String, trim: true },
    rajukCertificateUrl: { type: String, trim: true },
    // Final declaration
    declarationAgreed: { type: Boolean },
    declarationSignature: { type: String, trim: true },
    declarationSignedAt: { type: String, trim: true },
    // `default: undefined` keeps empty arrays out of land-owner documents.
    education: { type: [educationSchema], default: undefined },
    experience: { type: [experienceSchema], default: undefined },
    expertise: { type: [String], default: undefined },
    skills: { type: [skillSchema], default: undefined },
    achievements: { type: [achievementSchema], default: undefined },
    portfolio: { type: [portfolioProjectSchema], default: undefined },
  },
  { _id: false }
);

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    // Chosen once at signup; unique and never updated (no setter path exists).
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true,
    },
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
