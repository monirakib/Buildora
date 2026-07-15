import type {
  BuildingType,
  ContractStatus,
  DeliverableKind,
  DeliverableStatus,
  DocumentCategory,
  InquiryStatus,
  LandUse,
  PaymentKind,
  PaymentMethod,
  ProjectStatus,
  ProposalStatus,
  UserRole,
  VerificationStatus,
} from "./enums";

/**
 * Optional profile a land owner fills in after signup. Every field is
 * optional — the profile starts empty and is completed over time.
 */
export interface LandOwnerProfile {
  nid?: string;
  avatarUrl?: string;
  company?: string;
  bio?: string;
  /** Typical land size in katha. */
  landAreaKatha?: number;
  buildingType?: BuildingType;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
  floors?: number;
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
 * Profile a professional (architect, engineer, contractor, supplier) fills in
 * at signup and refines over time. The credentials here are what a supervisor
 * reviews when the professional requests verification.
 */
export interface ProfessionalProfile {
  avatarUrl?: string;
  /** Firm or company they practise under. */
  company?: string;
  bio?: string;
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

  // ---- Professional details ----
  /** e.g. "Principal Architect". */
  professionalTitle?: string;
  /** True when practising independently rather than under a firm. */
  isIndependent?: boolean;
  officeAddress?: string;
  /** Comma-separated, e.g. "Bangla, English". */
  languages?: string;
  linkedin?: string;

  // ---- License / membership ----
  /** e.g. "Active", "Provisional", "Expired". */
  membershipStatus?: string;
  /** ISO dates "YYYY-MM-DD". */
  licenseIssueDate?: string;
  licenseExpiryDate?: string;
  iabCertificateUrl?: string;
  membershipCardUrl?: string;
  rajukEnlistmentNo?: string;
  rajukCertificateUrl?: string;

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
  email: string;
  phone?: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  profile?: UserProfile;
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
  licenseAuthority?: string;
  specialties?: string;
  yearsExperience?: number;
  website?: string;
  education?: EducationEntry[];
  achievements?: AchievementEntry[];
  portfolio?: PortfolioProject[];
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

/**
 * A land owner's construction project. Starts life as a posted brief that
 * architects respond to; `status` then tracks it through concept, design,
 * permits, and construction. `architect` is set once a proposal is accepted.
 */
export interface Project {
  id: string;
  owner: UserRef;
  architect?: UserRef;
  title: string;
  description: string;
  /** Plot address, e.g. "House 12, Road 5". */
  address: string;
  /** Locality used to match a DAP zone, e.g. "Dhanmondi". */
  areaName: string;
  landAreaKatha: number;
  buildingType: BuildingType;
  floors: number;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
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
  other: { id: string; name: string; username: string; role: UserRole; avatarUrl?: string };
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
