import { Schema, model } from "mongoose";
import {
  PaymentMethod,
  UserRole,
  VerificationStatus,
  type BillingInfo,
  type NotificationPreferences,
  type UserProfile,
} from "@buildora/shared";

/** Distributes over the UserProfile union, which a bare Omit would collapse. */
type OmitSecrets<T> = T extends unknown
  ? Omit<T, "nid" | "nidKey" | "nidCheck" | "dateOfBirth">
  : never;

/**
 * How a profile is **stored**, which is no longer how it is sent.
 *
 * The plaintext secrets are absent from this type on purpose. A document loaded
 * from MongoDB genuinely does not have them — only their encrypted twins — so
 * anything reading `profile.nid` off a raw document is reading undefined. Left
 * in the type that would be a silent bug; taken out, it is a compile error, and
 * the compiler points at every place that needs to decrypt first.
 *
 * Use services/profileCrypto.ts to move between this and UserProfile.
 */
export type StoredProfile = OmitSecrets<UserProfile> & {
  nidEnc?: string;
  nidKeyBlind?: string;
  nidCheckEnc?: string;
  dateOfBirthEnc?: string;
  /** Which data key the fields above were encrypted with. */
  encV?: string;
};

/** How billing is stored — same idea, for the three financial identifiers. */
export type StoredBilling = Omit<
  BillingInfo,
  "mobileWalletNumber" | "bankAccountNumber" | "tin"
> & {
  mobileWalletNumberEnc?: string;
  bankAccountNumberEnc?: string;
  tinEnc?: string;
  encV?: string;
};

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
  /**
   * When the address was proved reachable by clicking a link we mailed to it.
   * Absent means unverified, which is the state every account starts in — and
   * an unverified address is never sent notification mail (see
   * services/notifications.ts).
   */
  emailVerifiedAt?: Date;
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
  profile?: StoredProfile;
  /** Last time the user held a live signaling socket — powers "Active 5 mins ago". */
  lastSeenAt?: Date;
  billing?: StoredBilling;
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
    dummy: { type: Boolean },
    ageOk: { type: Boolean },
    age: { type: Number },
    ageIssue: { type: String, trim: true },
    postcodeMatches: { type: Boolean, default: null },
    ocr: {
      type: new Schema(
        {
          readable: { type: Boolean, required: true },
          name: { type: String, trim: true },
          nid: { type: String, trim: true },
          dateOfBirth: { type: String, trim: true },
          side: { type: String, trim: true },
          faceCount: { type: Number, default: null },
          hasPhotoBox: { type: Boolean, default: null },
          nameMatches: { type: Boolean, default: null },
          nidMatches: { type: Boolean, default: null },
          dobMatches: { type: Boolean, default: null },
          note: { type: String, trim: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // The same reader run over the reverse of the card.
    back: {
      type: new Schema(
        {
          readable: { type: Boolean, required: true },
          address: { type: String, trim: true },
          issueDate: { type: String, trim: true },
          hasBarcode: { type: Boolean, default: null },
          districtMatches: { type: Boolean, default: null },
          note: { type: String, trim: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // What the uploaded files look like — see services/nidImage.ts.
    images: {
      type: [
        new Schema(
          {
            side: { type: String, required: true, trim: true },
            width: { type: Number },
            height: { type: Number },
            aspectRatio: { type: Number },
            aspectOk: { type: Boolean, default: null },
            resolutionOk: { type: Boolean, default: null },
            editorSoftware: { type: String, trim: true },
            note: { type: String, trim: true },
          },
          { _id: false }
        ),
      ],
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
const profileSchema = new Schema<StoredProfile>(
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
    // The NID, encrypted (services/profileCrypto.ts). Not searchable and not
    // indexed — an AES-GCM ciphertext differs every time it is written, so
    // there is nothing here to match on.
    nidEnc: { type: String },
    // The searchable half: a keyed HMAC of the *canonical* NID. Deterministic,
    // so uniqueness and duplicate lookups still work; keyed, so a 13-digit
    // number can't be brute-forced back out of it by someone holding the
    // database. Canonical because the same citizen can write their number two
    // ways — a 17-digit NID is the 13-digit one with the birth year in front —
    // and comparing raw strings would let one person hold two accounts.
    nidKeyBlind: { type: String, trim: true },
    // The pre-screen record, encrypted whole: it holds the NID plus the name,
    // date of birth and address transcribed off the card.
    nidCheckEnc: { type: String },
    // Which data key the encrypted fields above were written with. Indexed so
    // a key rotation can count what is left to convert without a table scan.
    encV: { type: String, index: true },
    // Professional
    licenseAuthority: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    specialties: { type: String, trim: true },
    yearsExperience: { type: Number, min: 0 },
    website: { type: String, trim: true },
    // Identity (architect verification wizard) — supervisor-only fields,
    // excluded from the public projection in professionals.controller.
    // The date of birth is encrypted: with a name it is a direct identity-theft
    // input, and nothing queries on it.
    dateOfBirthEnc: { type: String },
    gender: { type: String, trim: true },
    // Addresses: a free-text street line plus the structured division/district/
    // postcode the NID geographic checks compare against.
    currentAddress: { type: String, trim: true },
    currentDivision: { type: String, trim: true },
    currentDistrict: { type: String, trim: true },
    currentPostcode: { type: String, trim: true },
    permanentAddress: { type: String, trim: true },
    permanentDivision: { type: String, trim: true },
    permanentDistrict: { type: String, trim: true },
    permanentPostcode: { type: String, trim: true },
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
const billingSchema = new Schema<StoredBilling>(
  {
    billingName: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, trim: true },
    postcode: { type: String, trim: true },
    country: { type: String, trim: true },
    preferredMethod: { type: String, enum: Object.values(PaymentMethod) },
    // The three that identify an account someone can move money out of are
    // encrypted; the names and branch beside them are not, because they
    // identify an institution rather than an account.
    mobileWalletNumberEnc: { type: String },
    bankAccountName: { type: String, trim: true },
    bankAccountNumberEnc: { type: String },
    bankName: { type: String, trim: true },
    bankBranch: { type: String, trim: true },
    tinEnc: { type: String },
    encV: { type: String },
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
    // Absent until the confirmation link is clicked. Every account that existed
    // before this feature is therefore unverified, which is correct — nobody
    // ever proved those addresses.
    emailVerifiedAt: { type: Date },
    // Secondary contact address. Not unique and never usable to log in — it
    // only receives receipts and recovery mail.
    recoveryEmail: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    altPhone: { type: String, trim: true },
    // select:false so the hash is left behind by default on every query in the
    // app. Responses are already built from hand-written field lists, so
    // nothing leaks it today — this is the backstop for the handler nobody has
    // written yet that returns a user document straight from the database.
    // The three places that genuinely need it (login, change email, change
    // password) ask for it with .select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(UserRole), required: true },
    verificationStatus: {
      type: String,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING_VERIFICATION,
    },
    profile: { type: profileSchema, default: undefined },
    // Written by the signaling server on connect/disconnect (see realtime/signaling.ts).
    // Review summary — see services/ratings.ts. Deliberately not indexed on its
    // own: the only query that filters or sorts on it is the professionals
    // directory, which always constrains `role` too, so the
    // {role, verificationStatus, ratingAvg, ratingCount} index at the bottom of
    // this file covers it. A standalone index here would only add write cost.
    ratingAvg: { type: Number, min: 1, max: 5 },
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

/**
 * One NID, one account.
 *
 * Enforced on the blind index rather than the number itself, because the number
 * is now encrypted and every copy of it looks different. The HMAC is
 * deterministic, so the constraint means exactly what it used to.
 *
 * Partial rather than sparse: most accounts have no NID yet, and a plain unique
 * index would treat every one of those as the same missing value and reject the
 * second signup. The filter limits the constraint to documents that actually
 * carry a string, so accounts without an NID never collide with each other.
 *
 * The index will refuse to build if duplicates already exist in the database —
 * run `pnpm encrypt:pii` first, which reports them.
 */
userSchema.index(
  { "profile.nidKeyBlind": 1 },
  { unique: true, partialFilterExpression: { "profile.nidKeyBlind": { $type: "string" } } }
);

/**
 * The professionals directory, which is the busiest read in the app and until
 * now had no index at all behind it.
 *
 * `listProfessionals` filters on `role` and `verificationStatus` and sorts
 * verified-first then newest. Without an index MongoDB reads every user
 * document and then sorts the survivors in memory — two costs, not one, and the
 * in-memory sort is the one that fails first, because the server aborts a sort
 * over 32 MB of documents rather than finishing it.
 *
 * Field order follows equality-then-sort: the two fields matched exactly come
 * first, so the index narrows to a contiguous block, and `createdAt` last means
 * that block is already in the order the query wants and no sort runs at all.
 *
 * The leading `role` also means this index serves the fan-out queries that walk
 * a whole role — `find({ role: ADMIN })` in disputes and verification, and
 * `find({ role: CONTRACTOR, verificationStatus: APPROVED })` when a tender is
 * published — since a query can use any prefix of an index's fields.
 */
userSchema.index({ role: 1, verificationStatus: 1, createdAt: -1 });

/**
 * The same directory under `?sort=rating`.
 *
 * A separate index rather than an extra field on the one above, because sort
 * fields only work from an index if they follow the equality fields with no gap
 * — `createdAt` sitting between `verificationStatus` and `ratingAvg` would stop
 * the rating sort from using it.
 *
 * This also covers the `minRating` filter (`ratingAvg: { $gte }`), which is a
 * range: ranges go last, after the equality fields, for the same reason.
 */
userSchema.index({ role: 1, verificationStatus: 1, ratingAvg: -1, ratingCount: -1 });

export const User = model<UserDoc>("User", userSchema);
