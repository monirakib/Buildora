import type {
  BroadcastAudience,
  BuildingType,
  CallMedia,
  CallStatus,
  ContractStatus,
  DeliverableKind,
  DeliverableStatus,
  DocumentCategory,
  InquiryStatus,
  LandUse,
  NotificationType,
  OrderStatus,
  PaymentKind,
  PaymentMethod,
  ProductCategory,
  ProjectStatus,
  ProposalStatus,
  UserRole,
  VerificationStatus,
} from "./enums";

/**
 * Optional profile a land owner fills in after signup. Every field is
 * optional — the profile starts empty and is completed over time.
 *
 * Deliberately holds no land or build details: those belong to a specific
 * Project (which has its own landAreaKatha / floors / budget), not to the
 * person. A land owner may have several plots, so pinning one set of land
 * figures to their account never made sense.
 */
export interface LandOwnerProfile {
  nid?: string;
  /** Photos of the NID card, so the automated check and a supervisor can read it. */
  nidFrontUrl?: string;
  nidBackUrl?: string;
  /** Result of the automated NID pre-screen — see NidCheck. */
  nidCheck?: NidCheck;
  /** ISO "YYYY-MM-DD" — cross-checked against a 17-digit NID's birth year. */
  dateOfBirth?: string;
  avatarUrl?: string;
  company?: string;
  bio?: string;
}

/**
 * Billing details captured on the account settings page, used to pre-fill
 * escrow deposits and payouts. Stored on the user rather than inside
 * `profile`, because it applies to every role identically.
 */
export interface BillingInfo {
  /** Name the invoice is made out to, if different from the account name. */
  billingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  /** Defaults to Bangladesh; kept editable for overseas clients. */
  country?: string;
  /** How this user prefers to send and receive money. */
  preferredMethod?: PaymentMethod;
  /** bKash / Nagad wallet number, when the preferred method is a wallet. */
  mobileWalletNumber?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankBranch?: string;
  /** Taxpayer identification number, for invoices that need one. */
  tin?: string;
}

/**
 * One live login, as shown in the account console's "Devices" list. Deliberately
 * carries no token — only enough to recognise a login and decide whether to end
 * it. The raw User-Agent string comes over as-is; the web app turns it into a
 * readable device name.
 */
export interface AccountSession {
  id: string;
  /** Raw User-Agent captured when this login started; absent on old sessions. */
  userAgent?: string;
  /** ISO timestamp — when this login was last used. */
  lastSeenAt: string;
  /** ISO timestamp — when this login started. */
  createdAt: string;
  /** True for the login making the request; it can't be signed out from here. */
  current: boolean;
}

/** One degree/qualification on a professional's profile. */
export interface EducationEntry {
  /** e.g. "B.Arch", "M.Sc in Structural Engineering". */
  degree: string;
  institution: string;
  department?: string;
  /** Graduation year. */
  year?: number;
  /** e.g. "3.75 / 4.00" — kept as text so any grading scale fits. */
  cgpa?: string;
  /** Uploaded certificate image. */
  certificateUrl?: string;
  /** Uploaded transcript image. */
  transcriptUrl?: string;
}

/** One job/engagement in a professional's work history. */
export interface ExperienceEntry {
  company: string;
  designation: string;
  /** e.g. "Full-time", "Part-time", "Contract", "Freelance". */
  employmentType?: string;
  /** ISO date string "YYYY-MM" or "YYYY-MM-DD". */
  startDate?: string;
  endDate?: string;
  /** True while this is their current position (endDate ignored). */
  isCurrent?: boolean;
  /** Responsibilities and major projects handled in this role. */
  description?: string;
}

/** Proficiency levels for the technical-skill cards. */
export type SkillLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";

/** One design/engineering tool the professional works with. */
export interface SkillEntry {
  /** e.g. "AutoCAD", "Revit". */
  name: string;
  level: SkillLevel;
}

/** A notable award, publication, or milestone. */
export interface AchievementEntry {
  title: string;
  year?: number;
  description?: string;
}

/** A past design/build the professional showcases, with photos. */
export interface PortfolioProject {
  title: string;
  description?: string;
  year?: number;
  /** e.g. "Dhanmondi, Dhaka". */
  location?: string;
  /** e.g. "Residential", "Commercial", "Hospital". */
  buildingType?: string;
  client?: string;
  /** Built area in square feet. */
  areaSqft?: number;
  /** Approximate project budget in BDT. */
  budgetBdt?: number;
  /** The professional's role, e.g. "Lead Architect". */
  role?: string;
  /** Uploaded photos/renders; the first image is used as the cover. */
  imageUrls: string[];
}

/**
 * One membership record read back from the Institute of Architects Bangladesh
 * public directory (https://iab.org.bd/directory/).
 *
 * `status` is the directory's own word — "regular", "irregular", "suspended",
 * "deceased" — and `memberType` is the grade: student, associate, member or
 * fellow. Both are stored verbatim rather than mapped to our own enum, so the
 * supervisor sees exactly what IAB published.
 */
export interface IabMember {
  /** Membership number as the directory spells it, e.g. "AA-920". */
  membershipNo: string;
  /** Full name on the IAB record — compare this against the applicant's name. */
  name: string;
  /**
   * Email IAB has on file. Every card carries one. Used to prefill the signup
   * form, and kept as the account's `altEmail` when the architect signs up
   * under a different address. Never shown on a public profile.
   */
  email?: string;
  /** Tier, as the official label: "Associate Member", "Fellow", … */
  category?: string;
  /** Standing, as the official label: "Regular", "Suspended", … */
  status?: string;
  /** The directory's own raw words, kept so a tier we don't map still shows. */
  rawCategory?: string;
  rawStatus: string;
  /** True only for "regular" — the one standing that means a valid membership. */
  isRegular: boolean;
}

/**
 * Outcome of an IAB directory lookup, stored on the profile so the supervisor
 * reviews a result the server fetched rather than one the browser claimed.
 */
export interface IabCheck {
  /** The number that was looked up, normalised (uppercased, dash inserted). */
  membershipNo: string;
  /** The matching record, or `null` when the directory has no such number. */
  member: IabMember | null;
  /** ISO timestamp of the lookup — the directory changes, this result doesn't. */
  checkedAt: string;
  /** The account name this was compared against, as it read at check time. */
  claimedName?: string;
  /**
   * Whether `claimedName` and the directory name look like the same person.
   * `null` when there was no record to compare against. A `false` here is what
   * blocks submission unless manual review was requested.
   */
  nameMatches?: boolean | null;
}

/**
 * Result of the automated NID pre-screen, recorded by the API.
 *
 * This is NOT government verification — the Election Commission's Porichoy
 * gateway is fee-based and issued only to vetted companies, so nothing here
 * proves the number exists or belongs to this person. It narrows what a
 * supervisor has to check by hand. Never present it as more than that.
 */
export interface NidCheck {
  /** Digits only, as checked. */
  nid: string;
  /** "SMART_10" | "LEGACY_13" | "LEGACY_17", when the shape was recognised. */
  format?: string;
  /** Whether the number is one of the three valid shapes. */
  formatOk: boolean;
  /** Complaint about the format, if any. */
  formatIssue?: string;
  /**
   * 17-digit numbers carry a birth year — does it agree with the date of birth
   * on the profile? `null` when there was nothing to compare.
   */
  dobMatches?: boolean | null;
  /** Another account already holds this NID — the one hard failure. */
  duplicate: boolean;
  /** What the card image actually said, read by the OCR pass. */
  ocr?: NidOcrResult;
  checkedAt: string;
}

/**
 * One brand a supplier is authorised to sell, with the dealership letter that
 * says so. Buyers on the marketplace care about this: "Shah Cement dealer" and
 * "sells Shah Cement" are not the same claim.
 */
export interface BrandAuthorization {
  /** Manufacturer, e.g. "Shah Cement", "BSRM". */
  brand: string;
  /** Uploaded dealership/authorisation letter. */
  documentUrl?: string;
  /** ISO "YYYY-MM-DD" — when the authorisation runs out, if it does. */
  validTill?: string;
}

/**
 * One credential number the API checked automatically at submit time.
 *
 * As with NidCheck, this is pre-screening and nothing more: NBR publishes no
 * free BIN/TIN lookup, and trade licences are issued by hundreds of separate
 * local authorities with no shared register. All this can say is that a number
 * is the right shape, hasn't expired, and isn't already claimed by a different
 * account. Never present it as registry verification.
 */
export interface CredentialCheckItem {
  /** What was checked, e.g. "Trade licence number". */
  label: string;
  /** The value as checked, normalised. */
  value: string;
  /** Whether it's a plausible shape for that kind of number. */
  formatOk: boolean;
  /** Why the format failed, if it did. */
  issue?: string;
  /** True when another account already claims this exact number. */
  duplicate: boolean;
  /** Whether an attached expiry date has passed; null when there is none. */
  expired?: boolean | null;
}

/** The full set of automated credential checks run for one submission. */
export interface CredentialCheck {
  items: CredentialCheckItem[];
  checkedAt: string;
}

/** What Gemini read off the uploaded NID card, and how it compared. */
export interface NidOcrResult {
  /** False when the image couldn't be read at all. */
  readable: boolean;
  /** Name printed on the card. */
  name?: string;
  /** NID number printed on the card, digits only. */
  nid?: string;
  /** Date of birth printed on the card, ISO "YYYY-MM-DD" where legible. */
  dateOfBirth?: string;
  /** Whether each printed value agrees with what the user typed. */
  nameMatches?: boolean | null;
  nidMatches?: boolean | null;
  dobMatches?: boolean | null;
  /** Set when the model refused or the image wasn't an NID card at all. */
  note?: string;
}

/**
 * Profile a professional (architect, engineer, contractor, supplier) fills in
 * at signup and refines over time. The credentials here are what a supervisor
 * reviews when the professional requests verification.
 */
export interface ProfessionalProfile {
  avatarUrl?: string;
  /** Firm or company they practise under. */
  company?: string;
  bio?: string;
  /** Their own portfolio headline, e.g. "Architecture for a Better Tomorrow". */
  portfolioTitle?: string;
  /** Short hero introduction shown under the headline on the public portfolio. */
  portfolioIntro?: string;
  /** Registration body, e.g. "IAB", "IEB", "RAJUK". */
  licenseAuthority?: string;
  /** Professional registration / license number (IAB membership no. for architects). */
  licenseNumber?: string;
  /** Free-text specialties, e.g. "Residential, RCC design". */
  specialties?: string;
  yearsExperience?: number;
  website?: string;

  // ---- Identity (supervisor-only; never in the public projection) ----
  /** ISO date "YYYY-MM-DD". */
  dateOfBirth?: string;
  gender?: string;
  currentAddress?: string;
  permanentAddress?: string;
  /** National ID number. */
  nid?: string;
  nidFrontUrl?: string;
  nidBackUrl?: string;
  /** Result of the automated NID pre-screen — see NidCheck. */
  nidCheck?: NidCheck;

  // ---- Professional details ----
  /** e.g. "Principal Architect". */
  professionalTitle?: string;
  /** True when practising independently rather than under a firm. */
  isIndependent?: boolean;
  officeAddress?: string;
  /**
   * Where they practise — one of BD_DIVISIONS and a district inside it. Kept as
   * a fixed pair rather than free text so the directory filter is an exact
   * match; the office address stays for the human-readable version.
   */
  practiceDivision?: string;
  practiceDistrict?: string;
  /** Comma-separated, e.g. "Bangla, English". */
  languages?: string;
  linkedin?: string;

  // ---- License / membership ----
  /** One of MEMBERSHIP_STATUSES, e.g. "Regular". */
  membershipStatus?: string;
  /** One of MEMBERSHIP_CATEGORIES, e.g. "Associate Member". */
  membershipCategory?: string;
  /** ISO dates "YYYY-MM-DD". */
  licenseIssueDate?: string;
  licenseExpiryDate?: string;
  iabCertificateUrl?: string;
  membershipCardUrl?: string;
  rajukEnlistmentNo?: string;
  rajukCertificateUrl?: string;
  /** Result of the last IAB directory lookup, recorded by the API at submit time. */
  iabCheck?: IabCheck;
  /**
   * The primary certificate for roles whose body isn't IAB — today the
   * engineer's IEB certificate. Architects keep using `iabCertificateUrl`;
   * splitting them keeps each field's name honest about what it holds.
   */
  licenseCertificateUrl?: string;

  // ---- Structural engineer ----
  /**
   * The engineer's professional seal, scanned. This is the credential that
   * matters most on this platform: an engineer's signature is what passes a
   * milestone inspection and releases an escrow tranche, so a supervisor needs
   * to have seen the seal that signature will carry.
   */
  professionalSealUrl?: string;

  // ---- Business registration (contractor & supplier) ----
  /** City corporation / pourashava trade licence number. */
  tradeLicenseNo?: string;
  /** The authority that issued it, e.g. "Dhaka North City Corporation". */
  tradeLicenseIssuer?: string;
  /** ISO "YYYY-MM-DD" — trade licences are renewed yearly. */
  tradeLicenseExpiry?: string;
  tradeLicenseUrl?: string;
  /** NBR Business Identification Number (VAT registration), 13 digits. */
  binNumber?: string;
  binCertificateUrl?: string;
  /** NBR e-TIN, 12 digits. Required before any escrow payout. */
  tinNumber?: string;
  tinCertificateUrl?: string;
  /** RJSC company incorporation number, for firms that are incorporated. */
  rjscRegistrationNo?: string;
  rjscCertificateUrl?: string;

  // ---- Contractor capacity ----
  /** Who enlisted them — one of ENLISTMENT_BODIES. */
  enlistmentBody?: string;
  /** Enlistment class, e.g. "Class A" — it caps the contract value they may bid. */
  contractorClass?: string;
  enlistmentCertificateUrl?: string;
  /** Permanent crew they can field, used as a capacity signal on bids. */
  crewSize?: number;
  /** Selected chips from EQUIPMENT_OPTIONS. */
  equipment?: string[];
  /** Largest single contract completed, in BDT. */
  largestProjectBdt?: number;
  /** Bank solvency certificate — evidence they can carry a build's cash flow. */
  bankSolvencyUrl?: string;

  // ---- Supplier catalogue ----
  /** ProductCategory values — the material lines they stock. */
  supplyCategories?: string[];
  /** Dealership letters for the brands they claim to carry. */
  brandAuthorizations?: BrandAuthorization[];
  /** Where the stock actually is. */
  warehouseAddress?: string;
  /** BD_DISTRICTS values they deliver to. */
  deliveryDistricts?: string[];
  /** BSTI licence — mandatory for some materials (cement, rod, tiles). */
  bstiLicenseNo?: string;
  bstiCertificateUrl?: string;

  /** Automated pre-screen of the numbers above, recorded by the API at submit. */
  credentialCheck?: CredentialCheck;

  // ---- Structured sections ----
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  /** Selected chips from EXPERTISE_AREAS. */
  expertise?: string[];
  skills?: SkillEntry[];
  achievements?: AchievementEntry[];
  portfolio?: PortfolioProject[];

  // ---- Final declaration ----
  /** True once all declaration checkboxes were ticked at submission. */
  declarationAgreed?: boolean;
  /** Typed full-name signature. */
  declarationSignature?: string;
  /** ISO timestamp of when the declaration was signed. */
  declarationSignedAt?: string;
}

/** Either profile shape — which one applies is determined by `role`. */
export type UserProfile = LandOwnerProfile | ProfessionalProfile;

/** Minimal user shape shared between API responses and the web session store. */
export interface SessionUser {
  id: string;
  name: string;
  /** Chosen at signup, unique, and permanent — never editable afterwards. */
  username: string;
  /** Primary email: the login identifier. Changing it requires the password. */
  email: string;
  /** Optional second address for receipts and account recovery. */
  recoveryEmail?: string;
  phone?: string;
  /** Optional second number, e.g. an office line or a site contact. */
  altPhone?: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  profile?: UserProfile;
  billing?: BillingInfo;
}

/**
 * Public-safe view of a professional, as shown in the directory and on their
 * profile page. Deliberately omits email, phone, NID, and license number —
 * contact happens through inquiries, not by exposing personal details.
 */
export interface PublicProfessional {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  avatarUrl?: string;
  company?: string;
  bio?: string;
  /** Their own portfolio headline, e.g. "Architecture for a Better Tomorrow". */
  portfolioTitle?: string;
  /** Short hero introduction shown under the headline. */
  portfolioIntro?: string;
  licenseAuthority?: string;
  specialties?: string;
  yearsExperience?: number;
  website?: string;
  /** e.g. "Principal Architect" — shown under the name on the public portfolio. */
  professionalTitle?: string;
  /** Selected chips from EXPERTISE_AREAS. */
  expertise?: string[];
  education?: EducationEntry[];
  achievements?: AchievementEntry[];
  portfolio?: PortfolioProject[];
  /** Where they practise — used by the directory's location filter. */
  practiceDivision?: string;
  practiceDistrict?: string;
  /**
   * Mean of every review left on a completed contract, 1–5, rounded to one
   * decimal. Absent until they've been reviewed at least once — `undefined`
   * means "no ratings yet", which is not the same as a low score.
   */
  ratingAvg?: number;
  /** How many reviews that average is over. */
  ratingCount?: number;
}

/** A land owner's rating of an architect they completed a contract with. */
export interface Review {
  id: string;
  /** 1–5 whole stars. */
  rating: number;
  comment?: string;
  /** The reviewer. Reviews are never anonymous — the work was a paid contract. */
  author: { id: string; name: string; avatarUrl?: string };
  /** The project the contract was for, so readers can see what was built. */
  project: { id: string; title: string };
  createdAt: string;
}

/**
 * A professional's request to be verified, reviewed by a supervisor (ADMIN).
 * The supervisor reads the live profile (credentials, education, portfolio)
 * and approves or rejects with a note the professional can see.
 */
export interface VerificationRequest {
  id: string;
  professional: {
    id: string;
    name: string;
    username: string;
    role: UserRole;
    company?: string;
    avatarUrl?: string;
  };
  /** UNDER_REVIEW until the supervisor decides, then APPROVED or REJECTED. */
  status: VerificationStatus;
  /** Optional message from the professional to the reviewer. */
  message?: string;
  /** Supervisor's decision note — shown to the professional on rejection. */
  note?: string;
  /** True when the professional bypassed the automated IAB check. */
  manualReview?: boolean;
  createdAt: string;
  decidedAt?: string;
}

/** A land owner's contact request to a professional. */
export interface Inquiry {
  id: string;
  landOwner: { id: string; name: string; username: string };
  architect: { id: string; name: string; username: string; company?: string };
  message: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
}

/** Minimal user reference embedded in project/contract/message DTOs. */
export interface UserRef {
  id: string;
  name: string;
  username: string;
  company?: string;
}

/** A single point on the map. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Where the plot actually sits, picked on the map instead of typed. `lat`/`lng`
 * is the pin the owner dropped; `boundary` is the outline they traced around
 * the plot, which is optional — plenty of owners will just drop a pin.
 */
export interface PlotLocation extends LatLng {
  /** The address OpenStreetMap reported for the pin, kept for reference. */
  formattedAddress?: string;
  /** The traced plot outline — at least 3 corners when it's there at all. */
  boundary?: LatLng[];
  /** Area enclosed by `boundary`, in square feet (1 katha = 720 sqft). */
  boundaryAreaSqft?: number;
}

/** One suggestion from the map search box. */
export interface GeoPlace {
  /** Full name OpenStreetMap gave, e.g. "Road 5, Dhanmondi, Dhaka". */
  label: string;
  lat: number;
  lng: number;
  /** Locality guess, used to match a DAP zone. */
  areaName?: string;
}

/** What a reverse lookup gives back for a dropped pin. */
export interface GeoAddress {
  formattedAddress: string;
  /** Locality guess, e.g. "Dhanmondi" — feeds the DAP zone checker. */
  areaName?: string;
}

/**
 * A land owner's construction project. Starts life as a posted brief that
 * architects respond to; `status` then tracks it through concept, design,
 * permits, and construction. `architect` is set once a proposal is accepted,
 * `engineer` once the owner appoints one for the structural drawings.
 */
export interface Project {
  id: string;
  owner: UserRef;
  architect?: UserRef;
  /** The structural engineer, appointed after the design contract completes. */
  engineer?: UserRef;
  title: string;
  description: string;
  /** Plot address, e.g. "House 12, Road 5". */
  address: string;
  /** Locality used to match a DAP zone, e.g. "Dhanmondi". */
  areaName: string;
  /** Map pin (and optional traced outline) for the plot. */
  location?: PlotLocation;
  landAreaKatha: number;
  buildingType: BuildingType;
  floors: number;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
  // ---- Plot details ----
  /** Width of the fronting road in feet — drives the allowed FAR at RAJUK. */
  roadWidthFt?: number;
  /** Which way the plot faces, e.g. "South", "South-East corner". */
  plotFacing?: string;
  /** True when an old structure must be demolished first. */
  existingStructure?: boolean;
  soilTestDone?: boolean;
  // ---- Building requirements ----
  unitsPerFloor?: number;
  bedroomsPerUnit?: number;
  parkingSpaces?: number;
  hasLift?: boolean;
  hasBasement?: boolean;
  hasRooftopAmenities?: boolean;
  // ---- Preferences & readiness ----
  /** e.g. "Modern", "Traditional", "Minimalist". */
  designStyle?: string;
  /** When they want to start, e.g. "Within 3 months". */
  timeline?: string;
  ownershipDocsReady?: boolean;
  /** Plot photos uploaded with the brief. */
  photoUrls?: string[];
  status: ProjectStatus;
  /** Number of pending proposals — only filled in for the owner's own list. */
  pendingProposals?: number;
  createdAt: string;
  updatedAt: string;
}

/** An architect's response to a posted brief: pitch + fee quote. */
export interface Proposal {
  id: string;
  project: { id: string; title: string };
  architect: UserRef & { verificationStatus: VerificationStatus; avatarUrl?: string };
  coverLetter: string;
  /** Fee for the initial concept brief (500–1000 BDT per the plan). */
  conceptFeeBdt: number;
  /** Full design fee, held in escrow once the client proceeds. */
  designFeeBdt: number;
  estimatedWeeks?: number;
  status: ProposalStatus;
  createdAt: string;
}

/** One ledger entry on a contract (payments are simulated sandbox entries). */
export interface PaymentEntry {
  kind: PaymentKind;
  amountBdt: number;
  method?: PaymentMethod;
  /** Transaction reference the payer typed in, e.g. a bKash TrxID. */
  reference?: string;
  at: string;
}

/** A concept or design submission awaiting the client's review. */
export interface Deliverable {
  title: string;
  note?: string;
  fileUrl?: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  /** Client's feedback when requesting changes. */
  clientNote?: string;
  submittedAt: string;
  decidedAt?: string;
}

/**
 * The design contract between client and architect created when a proposal is
 * accepted. Carries the escrow ledger, deliverables, and revision counter.
 */
export interface Contract {
  id: string;
  project: { id: string; title: string };
  client: UserRef;
  architect: UserRef;
  status: ContractStatus;
  conceptFeeBdt: number;
  designFeeBdt: number;
  /** Platform commission taken from the escrow on release (0.10–0.15). */
  commissionRate: number;
  revisionsUsed: number;
  maxRevisions: number;
  payments: PaymentEntry[];
  deliverables: Deliverable[];
  /** Filled in at design approval. */
  commissionBdt?: number;
  releasedToArchitectBdt?: number;
  createdAt: string;
  updatedAt: string;
}

/** A two-person message thread, shaped for the caller ("other" = the other side). */
export interface Conversation {
  id: string;
  other: {
    id: string;
    name: string;
    username: string;
    role: UserRole;
    avatarUrl?: string;
    /** True while they have at least one tab connected to the signaling socket. */
    online: boolean;
    /** When they were last connected — used for "Active 5 mins ago" when offline. */
    lastSeenAt?: string;
  };
  lastMessage?: { body: string; at: string; mine: boolean };
  unreadCount: number;
  updatedAt: string;
}

/** One chat message; compare `senderId` with the session user to align bubbles. */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/* ---------- Voice calls (WebRTC 1:1) ---------- */

/** The other party on a call, shown in the ringing/in-call UI and call history. */
export interface CallPeer {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  avatarUrl?: string;
}

/**
 * A finished (or in-progress) call as it appears in a user's history.
 * `direction` is relative to the viewer: OUTGOING = they placed it.
 */
export interface CallRecord {
  id: string;
  direction: "OUTGOING" | "INCOMING";
  peer: CallPeer;
  status: CallStatus;
  /** Whether it was placed as a voice or a video call. */
  media: CallMedia;
  /** When the invite was sent. */
  startedAt: string;
  /** When the callee accepted, if they did. */
  answeredAt?: string;
  endedAt?: string;
  /** Talk time in seconds (0 for unanswered calls). */
  durationSec: number;
}

/**
 * One ICE server for the browser's RTCPeerConnection. STUN needs only `urls`;
 * a TURN relay adds credentials. Served by the API so the team can swap in a
 * TURN provider later by setting env vars — no client redeploy.
 */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Socket.IO event names for call signaling, shared so the client and server
 * can't drift. `sdp`/`candidate` payloads are the browser's WebRTC objects,
 * typed as `unknown` here because the shared package can't depend on DOM libs
 * (the API compiles under Node) — the web client casts them back.
 */
export const CALL_EVENTS = {
  // client → server
  start: "call:start",
  accept: "call:accept",
  reject: "call:reject",
  cancel: "call:cancel",
  hangup: "call:hangup",
  offer: "call:offer",
  answer: "call:answer",
  ice: "call:ice",
  /** "my camera/screen just went on or off" — relayed to the other party. */
  mediaState: "call:media-state",
  // server → client
  incoming: "call:incoming",
  accepted: "call:accepted",
  rejected: "call:rejected",
  cancelled: "call:cancelled",
  ended: "call:ended",
  unavailable: "call:unavailable",
  peerOffer: "call:peer-offer",
  peerAnswer: "call:peer-answer",
  peerIce: "call:peer-ice",
  peerMediaState: "call:peer-media-state",
} as const;

/** Payload the caller sends to start a call. Server acks with { callId }. */
export interface CallStartPayload {
  toUserId: string;
  /** Defaults to AUDIO when omitted. */
  media?: CallMedia;
}

/** Server → callee when a call comes in. */
export interface IncomingCallPayload {
  callId: string;
  from: CallPeer;
  media: CallMedia;
}

/**
 * What each side is currently sending video-wise. Sent whenever a camera or a
 * screen share is switched on or off, so the other end knows whether to show a
 * video tile or the "camera off" avatar. The video track itself is negotiated
 * once at the start of the call and simply swapped underneath — this event is
 * how the receiver learns what it's now looking at.
 */
export interface CallMediaStatePayload {
  callId: string;
  cameraOn: boolean;
  screenOn: boolean;
}

/** SDP offer/answer relayed between the two peers, keyed by call. */
export interface CallDescriptionPayload {
  callId: string;
  /** RTCSessionDescriptionInit on the web side. */
  sdp: unknown;
}

/** A single ICE candidate relayed between the two peers. */
export interface CallIcePayload {
  callId: string;
  /** RTCIceCandidateInit on the web side. */
  candidate: unknown;
}

/** Server → client when a call reaches a terminal state, with the final status. */
export interface CallStatusPayload {
  callId: string;
  status: CallStatus;
}

/** An admin-maintained DAP zone record (the rules, not hardcoded). */
export interface DapZone {
  id: string;
  /** Locality the zone covers, e.g. "Dhanmondi". */
  areaName: string;
  zoneCode: string;
  landUse: LandUse;
  /** Maximum floor-area ratio allowed on a plot. */
  maxFar: number;
  /** Maximum ground coverage as a percentage of the plot. */
  maxGroundCoveragePct: number;
  maxFloors?: number;
  notes?: string;
}

/** Admin-maintained RAJUK fee rate for one land-use category. */
export interface FeeRule {
  id: string;
  category: LandUse;
  label: string;
  baseFeeBdt: number;
  ratePerSqmBdt: number;
  notes?: string;
}

/** Server-computed RAJUK fee estimate. */
export interface FeeEstimate {
  category: LandUse;
  floorAreaSqm: number;
  baseFeeBdt: number;
  ratePerSqmBdt: number;
  areaFeeBdt: number;
  totalBdt: number;
}

/** One step of the ECPS permit process (admin-editable guide content). */
export interface EcpsStep {
  id: string;
  /** 1-based position in the process. */
  order: number;
  title: string;
  description: string;
  requiredDocuments: string[];
}

/** A project's progress through the ECPS steps. */
export interface EcpsApplication {
  id: string;
  projectId: string;
  /** Order of the step the application currently sits on. */
  currentStepOrder: number;
  /** True once the final step is marked done. */
  completed: boolean;
  history: { stepOrder: number; note?: string; at: string }[];
  createdAt: string;
  updatedAt: string;
}

/** One archived file on a project (uploaded image or an external link). */
export interface ProjectDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  fileUrl: string;
  uploader: { id: string; name: string };
  createdAt: string;
}

/* ---------- Marketplace ---------- */

/** One item a supplier/contractor sells on the marketplace. */
export interface Product {
  id: string;
  seller: {
    id: string;
    name: string;
    company?: string;
    role: UserRole;
    verificationStatus: VerificationStatus;
  };
  name: string;
  /** Manufacturer/brand, e.g. "Shah Cement". */
  brand?: string;
  category: ProductCategory;
  description?: string;
  /** Selling unit, e.g. "bag", "ton", "piece", "cft". */
  unit: string;
  priceBdt: number;
  imageUrl?: string;
  /** Sellers can pause a listing without deleting it. */
  isActive: boolean;
  createdAt: string;
}

/**
 * A land owner's order for one product. The name/unit/price are snapshotted
 * at order time so later listing edits don't rewrite history.
 */
export interface MarketOrder {
  id: string;
  buyer: { id: string; name: string; phone?: string };
  seller: { id: string; name: string; company?: string };
  product: { id: string; name: string; brand?: string; unit: string; priceBdt: number };
  quantity: number;
  totalBdt: number;
  deliveryAddress: string;
  phone: string;
  note?: string;
  status: OrderStatus;
  /** Set once the buyer's gateway payment clears; unpaid orders show a Pay button. */
  paidAt?: string;
  createdAt: string;
}

/* ---------- Notifications ---------- */

/**
 * One entry in a user's notification bell. Every row belongs to exactly one
 * recipient — a broadcast to 500 users writes 500 of these — so "read" and
 * "dismissed" are per-person without any extra bookkeeping.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  /** One-line headline, e.g. "New message from Rafiq Ahmed". */
  title: string;
  /** Supporting detail, e.g. the message preview. */
  body: string;
  /** In-app path to open on click, e.g. "/projects/123". */
  link?: string;
  /** The person who caused it, when there is one (shows their avatar). */
  actor?: { id: string; name: string; avatarUrl?: string };
  /** ISO timestamp of when the user read it; absent while still unread. */
  readAt?: string;
  createdAt: string;
}

/** The bell's payload: a page of notifications plus the badge number. */
export interface NotificationFeed {
  items: AppNotification[];
  /** Unread across the whole account, not just this page. */
  unreadCount: number;
}

/** Socket.IO channel the server uses to push notifications as they happen. */
export const NOTIFICATION_EVENTS = {
  /** server → client: one freshly created AppNotification. */
  created: "notification:created",
} as const;

/* ---------- Admin console ---------- */

/**
 * One announcement an admin sent out. The Notification rows it produced are
 * the copies each recipient sees; this is the campaign record behind them,
 * kept so the console can show a send history.
 */
export interface Broadcast {
  id: string;
  type: NotificationType.PROMOTION | NotificationType.SYSTEM;
  title: string;
  body: string;
  link?: string;
  /** A UserRole, or "ALL" for every user on the platform. */
  audience: BroadcastAudience;
  /** How many notification rows this send created. */
  recipients: number;
  sentBy: { id: string; name: string };
  createdAt: string;
}

/** One point of a per-day time series (date is "YYYY-MM-DD", Dhaka time). */
export interface DayPoint {
  date: string;
  count: number;
  /** Only on money series (e.g. marketplace order value that day). */
  totalBdt?: number;
}

/**
 * Everything the admin overview dashboard shows, computed server-side in one
 * request. All numbers come from live MongoDB aggregations — nothing cached
 * or hardcoded.
 */
export interface AdminOverview {
  totals: {
    users: number;
    landOwners: number;
    professionals: number;
    verifiedProfessionals: number;
    projects: number;
    proposals: number;
    contracts: number;
    inquiries: number;
    messages: number;
    products: number;
    activeProducts: number;
    orders: number;
    /** Verification requests currently waiting on a supervisor. */
    pendingVerifications: number;
    /** Sessions seen in the last 15 minutes and not logged out. */
    activeSessions: number;
    /** Logins in the last 24 hours. */
    logins24h: number;
  };
  finance: {
    conceptFeesBdt: number;
    /** Deposits minus releases and refunds — money currently held in escrow. */
    escrowHeldBdt: number;
    releasedToArchitectsBdt: number;
    commissionBdt: number;
    /** Marketplace order value, cancelled orders excluded. */
    marketplaceGmvBdt: number;
  };
  usersByRole: { role: UserRole; count: number }[];
  projectsByStatus: { status: ProjectStatus; count: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  /** Last 30 days, oldest first, zero-filled. */
  signupsByDay: DayPoint[];
  ordersByDay: DayPoint[];
  /** Newest first, mixed: signups, orders, briefs, verification requests. */
  activity: AdminActivityItem[];
}

/** One row of the overview's recent-activity feed. */
export interface AdminActivityItem {
  kind: "signup" | "order" | "project" | "verification";
  /** e.g. "Rafiq Ahmed joined as Architect". */
  text: string;
  at: string;
}

/** One row of the admin user-management table. */
export interface AdminUserRow {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  avatarUrl?: string;
  createdAt: string;
  /** Most recent session activity, if the user has ever logged in. */
  lastActiveAt?: string;
  /** Logins that are still valid (not logged out). */
  activeSessions: number;
}

/** Cursor-free paginated list wrapper for directory results. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
