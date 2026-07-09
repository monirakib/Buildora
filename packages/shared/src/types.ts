import type { BuildingType, InquiryStatus, UserRole, VerificationStatus } from "./enums";

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
  /** Graduation year. */
  year?: number;
  /** Uploaded certificate/transcript image. */
  certificateUrl?: string;
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
  /** Uploaded photos/renders of the design. */
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
  /** Professional registration / license number. */
  licenseNumber?: string;
  /** Free-text specialties, e.g. "Residential, RCC design". */
  specialties?: string;
  yearsExperience?: number;
  website?: string;
  education?: EducationEntry[];
  achievements?: AchievementEntry[];
  portfolio?: PortfolioProject[];
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
