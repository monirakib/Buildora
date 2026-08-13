import { Schema, model } from "mongoose";
import {
  PaymentMethod,
  UserRole,
  VerificationStatus,
  type BillingInfo,
  type NotificationPreferences,
  type UserProfile,
} from "@buildora/shared";

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
  recoveryEmail?: string;
  phone?: string;
  altPhone?: string;
  passwordHash: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  /**
   * Denormalised review summary, recomputed by services/ratings.ts whenever a
   * review is written. Kept on the user so the directory can sort and filter by
   * rating in one query instead of aggregating the Review collection per page.
   * `ratingCount: 0` means nobody has reviewed them yet.
   */
  ratingAvg?: number;
  ratingCount?: number;
  profile?: UserProfile;
  /** Last time the user held a live signaling socket — powers "Active 5 mins ago". */
  lastSeenAt?: Date;
  billing?: BillingInfo;
  /**
   * Which out-of-app channels this user allows. Absent means "never chose",
   * which is treated as the defaults (both on) — see DEFAULT_NOTIFICATION_PREFERENCES.
   * The in-app bell isn't listed because it can't be turned off.
   */
  notificationPrefs?: NotificationPreferences;
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

// One IAB directory lookup. `member` is null when the directory has no such
// membership number — a recorded "not found", which is different from never
// having checked (the whole `iabCheck` being absent).
const iabCheckSchema = new Schema(
  {
    membershipNo: { type: String, required: true, trim: true },
    member: {
      type: new Schema(
        {
          membershipNo: { type: String, required: true, trim: true },
          name: { type: String, required: true, trim: true },
          email: { type: String, lowercase: true, trim: true },
          // Official labels, plus the directory's raw words in case IAB adds a
          // tier or standing this build doesn't know how to map.
          category: { type: String, trim: true },
          status: { type: String, trim: true },
          rawCategory: { type: String, trim: true },
          rawStatus: { type: String, required: true, trim: true },
          isRegular: { type: Boolean, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    checkedAt: { type: String, required: true },
    /** The account name as it read when the check ran. */
    claimedName: { type: String, trim: true },
    /** null when there was no record to compare the name against. */
    nameMatches: { type: Boolean, default: null },
  },
  { _id: false }
);

// The automated NID pre-screen (see controllers/nid.controller.ts). Server-
// written only — the profile PATCH schemas drop a client-sent `nidCheck`.
const nidCheckSchema = new Schema(
  {
    nid: { type: String, required: true, trim: true },
    format: { type: String, trim: true },
    formatOk: { type: Boolean, required: true },
    formatIssue: { type: String, trim: true },
    // null means "nothing to compare against", not "didn't match".
    dobMatches: { type: Boolean, default: null },
    duplicate: { type: Boolean, required: true },
    ocr: {
      type: new Schema(
        {
          readable: { type: Boolean, required: true },
          name: { type: String, trim: true },
          nid: { type: String, trim: true },
          dateOfBirth: { type: String, trim: true },
          nameMatches: { type: Boolean, default: null },
          nidMatches: { type: Boolean, default: null },
          dobMatches: { type: Boolean, default: null },
          note: { type: String, trim: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    checkedAt: { type: String, required: true },
  },
  { _id: false }
);

// One brand a supplier is authorised to sell, with its dealership letter.
const brandAuthorizationSchema = new Schema(
  {
    brand: { type: String, required: true, trim: true },
    documentUrl: { type: String, trim: true },
    validTill: { type: String, trim: true },
  },
  { _id: false }
);

// The automated business-credential pre-screen (see services/credentials.ts).
// Server-written only — the profile PATCH schema drops a client-sent value, the
// same rule that protects nidCheck and iabCheck.
const credentialCheckSchema = new Schema(
  {
    items: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, trim: true },
            value: { type: String, required: true, trim: true },
            formatOk: { type: Boolean, required: true },
            issue: { type: String, trim: true },
            duplicate: { type: Boolean, required: true },
            // null means "no expiry date to judge", not "still valid".
            expired: { type: Boolean, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    checkedAt: { type: String, required: true },
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
    // Land owner. Land/build figures deliberately live on Project, not here —
    // an owner can have several plots, so one set of numbers on the account
    // would be meaningless.
    // Indexed because every NID check looks for another account holding the
    // same number. Not unique — land owners may not have supplied one yet.
    nid: { type: String, trim: true, index: true },
    nidCheck: { type: nidCheckSchema, default: undefined },
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
    // Practice location — a BD_DIVISIONS value and a district inside it.
    practiceDivision: { type: String, trim: true },
    practiceDistrict: { type: String, trim: true },
    languages: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    // License / membership
    membershipStatus: { type: String, trim: true },
    membershipCategory: { type: String, trim: true },
    licenseIssueDate: { type: String, trim: true },
    licenseExpiryDate: { type: String, trim: true },
    iabCertificateUrl: { type: String, trim: true },
    membershipCardUrl: { type: String, trim: true },
    rajukEnlistmentNo: { type: String, trim: true },
    rajukCertificateUrl: { type: String, trim: true },
    // IAB directory lookup, written by the API when the architect submits for
    // review (see services/iab.ts). Never accepted from the client — the
    // profile PATCH schema drops it, and the profile is replaced on every save,
    // so this only ever holds the result for the number actually submitted.
    iabCheck: { type: iabCheckSchema, default: undefined },
    // Primary certificate for bodies other than IAB (the engineer's IEB one).
    licenseCertificateUrl: { type: String, trim: true },

    // Structural engineer — the seal their inspection signatures carry.
    professionalSealUrl: { type: String, trim: true },

    // Business registration (contractor & supplier). The three numbers are
    // indexed because every pre-screen looks for another account claiming the
    // same one. Not unique — most professionals never fill them in.
    tradeLicenseNo: { type: String, trim: true, index: true },
    tradeLicenseIssuer: { type: String, trim: true },
    tradeLicenseExpiry: { type: String, trim: true },
    tradeLicenseUrl: { type: String, trim: true },
    binNumber: { type: String, trim: true, index: true },
    binCertificateUrl: { type: String, trim: true },
    tinNumber: { type: String, trim: true, index: true },
    tinCertificateUrl: { type: String, trim: true },
    rjscRegistrationNo: { type: String, trim: true },
    rjscCertificateUrl: { type: String, trim: true },

    // Contractor capacity
    enlistmentBody: { type: String, trim: true },
    contractorClass: { type: String, trim: true },
    enlistmentCertificateUrl: { type: String, trim: true },
    crewSize: { type: Number, min: 0 },
    equipment: { type: [String], default: undefined },
    largestProjectBdt: { type: Number, min: 0 },
    bankSolvencyUrl: { type: String, trim: true },

    // Supplier catalogue
    supplyCategories: { type: [String], default: undefined },
    brandAuthorizations: { type: [brandAuthorizationSchema], default: undefined },
    warehouseAddress: { type: String, trim: true },
    // Stored as a plain lat/lng pair rather than GeoJSON: nothing here does a
    // geospatial query, and a 2dsphere index would be weight without a use.
    warehouseLocation: {
      type: new Schema({ lat: { type: Number }, lng: { type: Number } }, { _id: false }),
      default: undefined,
    },
    deliveryDistricts: { type: [String], default: undefined },
    bstiLicenseNo: { type: String, trim: true },
    bstiCertificateUrl: { type: String, trim: true },

    credentialCheck: { type: credentialCheckSchema, default: undefined },

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

/**
 * Billing details from the account settings page. Applies to every role
 * identically, so it sits beside `profile` rather than inside it.
 */
const billingSchema = new Schema<BillingInfo>(
  {
    billingName: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, trim: true },
    postcode: { type: String, trim: true },
    country: { type: String, trim: true },
    preferredMethod: { type: String, enum: Object.values(PaymentMethod) },
    mobileWalletNumber: { type: String, trim: true },
    bankAccountName: { type: String, trim: true },
    bankAccountNumber: { type: String, trim: true },
    bankName: { type: String, trim: true },
    bankBranch: { type: String, trim: true },
    tin: { type: String, trim: true },
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
    // Secondary contact address. Not unique and never usable to log in — it
    // only receives receipts and recovery mail.
    recoveryEmail: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    altPhone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING_VERIFICATION,
    },
    profile: { type: profileSchema, default: undefined },
    // Written by the signaling server on connect/disconnect (see realtime/signaling.ts).
    // Review summary — see services/ratings.ts. Indexed because the directory
    // sorts by it and filters on a minimum score.
    ratingAvg: { type: Number, min: 1, max: 5, index: true },
    ratingCount: { type: Number, default: 0 },
    lastSeenAt: { type: Date },
    billing: { type: billingSchema, default: undefined },
    // `default: undefined` so an untouched account stores nothing and simply
    // inherits the defaults; only an explicit choice is written.
    notificationPrefs: {
      type: new Schema<NotificationPreferences>(
        {
          push: { type: Boolean, default: true },
          email: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

export const User = model<UserDoc>("User", userSchema);
