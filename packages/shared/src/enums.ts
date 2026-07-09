/** The six platform actors defined in the product plan (§3.1). */
export enum UserRole {
  LAND_OWNER = "LAND_OWNER",
  ARCHITECT = "ARCHITECT",
  STRUCTURAL_ENGINEER = "STRUCTURAL_ENGINEER",
  CONTRACTOR = "CONTRACTOR",
  SUPPLIER = "SUPPLIER",
  ADMIN = "ADMIN",
}

/** Professional verification pipeline stages (§5.1). */
export enum VerificationStatus {
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  DOCUMENTS_SUBMITTED = "DOCUMENTS_SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/** Verification badge tiers (§5.2). */
export enum BadgeTier {
  DOCUMENT_VERIFIED = "DOCUMENT_VERIFIED",
  PLATFORM_VERIFIED = "PLATFORM_VERIFIED",
  TOP_PROFESSIONAL = "TOP_PROFESSIONAL",
}

/** Building type a land owner intends to construct (used in profile + briefs). */
export enum BuildingType {
  RESIDENTIAL = "RESIDENTIAL",
  COMMERCIAL = "COMMERCIAL",
  MIXED_USE = "MIXED_USE",
}

/** Lifecycle of a land owner's contact request to a professional. */
export enum InquiryStatus {
  /** Sent by the land owner, not yet opened by the professional. */
  SENT = "SENT",
  /** The professional has opened it. */
  READ = "READ",
  /** The professional is interested and wants to proceed. */
  ACCEPTED = "ACCEPTED",
  /** The professional declined. */
  DECLINED = "DECLINED",
}

/** High-level lifecycle of a construction project (§4.1 customer journey). */
export enum ProjectStatus {
  DRAFT = "DRAFT",
  BRIEF_POSTED = "BRIEF_POSTED",
  CONCEPT_STAGE = "CONCEPT_STAGE",
  DESIGN_IN_PROGRESS = "DESIGN_IN_PROGRESS",
  PERMIT_STAGE = "PERMIT_STAGE",
  BIDDING = "BIDDING",
  UNDER_CONSTRUCTION = "UNDER_CONSTRUCTION",
  COMPLETED = "COMPLETED",
  ARCHIVED = "ARCHIVED",
}
