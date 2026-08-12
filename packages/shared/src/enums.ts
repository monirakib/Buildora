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

/** Lifecycle of an architect's proposal on a posted brief. */
export enum ProposalStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  WITHDRAWN = "WITHDRAWN",
}

/**
 * Lifecycle of a design contract (§4.1 steps 04–07): the client pays the
 * concept fee, reviews the concept, funds escrow, then reviews the full
 * design (≤3 revision rounds) — approval releases the escrow to the architect.
 */
export enum ContractStatus {
  AWAITING_CONCEPT_FEE = "AWAITING_CONCEPT_FEE",
  CONCEPT_IN_PROGRESS = "CONCEPT_IN_PROGRESS",
  AWAITING_ESCROW = "AWAITING_ESCROW",
  DESIGN_IN_PROGRESS = "DESIGN_IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/** What a ledger entry on a contract represents. */
export enum PaymentKind {
  CONCEPT_FEE = "CONCEPT_FEE",
  ESCROW_DEPOSIT = "ESCROW_DEPOSIT",
  ESCROW_RELEASE = "ESCROW_RELEASE",
  REFUND = "REFUND",
}

/** Payment channels named in the plan (§9.2). */
export enum PaymentMethod {
  BKASH = "BKASH",
  NAGAD = "NAGAD",
  BANK = "BANK",
  /**
   * Paid through the SSLCommerz gateway, which fronts bKash, Nagad, Rocket,
   * cards and internet banking behind one checkout page. The specific channel
   * the payer chose comes back from the gateway and is stored on the payment
   * session, not here — from the ledger's point of view it's one method.
   */
  SSLCOMMERZ = "SSLCOMMERZ",
}

/**
 * What a gateway payment is *for*. Every checkout in the app funnels through
 * one payment endpoint, and this is what tells it which domain object to
 * settle once the money confirms.
 */
export enum PaymentPurpose {
  /** The architect's concept-brief fee (plan §4.1 step 04). */
  CONTRACT_CONCEPT_FEE = "CONTRACT_CONCEPT_FEE",
  /** The design fee, into escrow. */
  CONTRACT_ESCROW = "CONTRACT_ESCROW",
  /** The structural engineer's fee, into escrow. */
  STRUCTURAL_ESCROW = "STRUCTURAL_ESCROW",
  /** A marketplace materials order. */
  MARKET_ORDER = "MARKET_ORDER",
  /** One construction milestone's tranche, into escrow. */
  MILESTONE_ESCROW = "MILESTONE_ESCROW",
}

/** Where one attempt at paying got to. */
export enum PaymentSessionStatus {
  /** Session created at the gateway; the payer is on the checkout page. */
  INITIATED = "INITIATED",
  /** Validated against the gateway and applied to the domain object. */
  PAID = "PAID",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/** Which phase of the contract a deliverable belongs to. */
export enum DeliverableKind {
  CONCEPT = "CONCEPT",
  DESIGN = "DESIGN",
}

/** Client review outcome for a submitted deliverable. */
export enum DeliverableStatus {
  PENDING_REVIEW = "PENDING_REVIEW",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
  APPROVED = "APPROVED",
}

/** DAP land-use classification for a zone (drives FAR/coverage rules). */
export enum LandUse {
  RESIDENTIAL = "RESIDENTIAL",
  COMMERCIAL = "COMMERCIAL",
  MIXED_USE = "MIXED_USE",
  INDUSTRIAL = "INDUSTRIAL",
  INSTITUTIONAL = "INSTITUTIONAL",
}

/**
 * Lifecycle of a contractor tender (plan §4.1 step 10).
 *
 * Bids stay sealed while the tender is OPEN — nobody, contractor or owner, can
 * read a submitted bid until bidding closes. That is what makes the comparison
 * fair, and it is enforced on the server, not by hiding things in the UI.
 */
export enum TenderStatus {
  /** Being written by the owner; no contractor can see it. */
  DRAFT = "DRAFT",
  /** Published and accepting sealed bids until the deadline. */
  OPEN = "OPEN",
  /** Deadline passed or closed early — bids are readable, none chosen yet. */
  CLOSED = "CLOSED",
  AWARDED = "AWARDED",
  CANCELLED = "CANCELLED",
}

/** Where one contractor's bid stands. */
export enum BidStatus {
  SUBMITTED = "SUBMITTED",
  /** Owner flagged it as a serious candidate while comparing. */
  SHORTLISTED = "SHORTLISTED",
  AWARDED = "AWARDED",
  REJECTED = "REJECTED",
  /** Pulled by the contractor before the deadline. */
  WITHDRAWN = "WITHDRAWN",
}

/**
 * The construction contract created when a bid is awarded.
 *
 * Unlike the design contract, the money is not escrowed in one lump: each
 * milestone is funded, inspected and released on its own, so an owner is never
 * holding the whole build cost against work that hasn't started.
 */
export enum BuildContractStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/**
 * One construction milestone's journey. The order matters — money only moves
 * forward through it, and only an engineer's passing inspection opens the gate
 * between work being claimed done and the tranche being released.
 */
export enum MilestoneStatus {
  /** Defined, not yet paid for. */
  PENDING = "PENDING",
  /** Owner has escrowed this tranche; the contractor can start. */
  FUNDED = "FUNDED",
  /** Contractor says the work is finished and wants it inspected. */
  AWAITING_INSPECTION = "AWAITING_INSPECTION",
  /** An engineer inspected and passed it; the owner can release. */
  INSPECTION_PASSED = "INSPECTION_PASSED",
  /** An engineer failed it; the contractor fixes and resubmits. */
  INSPECTION_FAILED = "INSPECTION_FAILED",
  /** Tranche paid out to the contractor, minus commission. */
  RELEASED = "RELEASED",
}

/** An engineer's verdict on a milestone inspection. */
export enum InspectionVerdict {
  PASS = "PASS",
  /** Passed, but with defects the contractor must still put right. */
  PASS_WITH_NOTES = "PASS_WITH_NOTES",
  FAIL = "FAIL",
}

/** What a marketplace product is, for browsing filters. */
export enum ProductCategory {
  CEMENT = "CEMENT",
  STEEL = "STEEL",
  BRICKS = "BRICKS",
  SAND_AGGREGATE = "SAND_AGGREGATE",
  TILES = "TILES",
  PAINT = "PAINT",
  ELECTRICAL = "ELECTRICAL",
  PLUMBING = "PLUMBING",
  WOOD = "WOOD",
  OTHER = "OTHER",
}

/**
 * Lifecycle of a marketplace order. Land owners order freely (no approval
 * ladder) — the status only tracks fulfilment by the seller.
 */
export enum OrderStatus {
  PLACED = "PLACED",
  CONFIRMED = "CONFIRMED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

/**
 * Lifecycle of a 1:1 voice call. A call rings, then either connects (ACCEPTED →
 * ENDED) or doesn't (REJECTED / MISSED / CANCELLED). The final status is what
 * shows in the call history.
 */
export enum CallStatus {
  /** Invite sent; the callee's device is ringing. */
  RINGING = "RINGING",
  /** Callee accepted — audio is connected. */
  ACCEPTED = "ACCEPTED",
  /** Callee declined the invite. */
  REJECTED = "REJECTED",
  /** Nobody picked up (callee offline, or it rang out). */
  MISSED = "MISSED",
  /** Caller gave up before the callee answered. */
  CANCELLED = "CANCELLED",
  /** Connected, then hung up normally. */
  ENDED = "ENDED",
}

/**
 * What a call was placed as. This is only the starting mode — either side can
 * turn their camera on or share their screen once a voice call is connected,
 * which is carried live over the signaling channel rather than stored here.
 */
export enum CallMedia {
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
}

/**
 * What kind of hole is cut into a wall on a 2D floor plan. Doors and windows
 * are drawn with different symbols but are otherwise the same thing: a gap of
 * a given width, sitting a given distance along a wall.
 */
export enum OpeningKind {
  DOOR = "DOOR",
  WINDOW = "WINDOW",
}

/** Filing category for the project document archive. */
export enum DocumentCategory {
  DESIGN = "DESIGN",
  /** A 3D design model (.glb) viewable in the in-browser 3D viewer. */
  MODEL_3D = "MODEL_3D",
  PERMIT = "PERMIT",
  CONTRACT = "CONTRACT",
  SITE = "SITE",
  OTHER = "OTHER",
}

/**
 * What a notification is about. Drives the icon and accent colour in the bell
 * menu, and lets the user filter the feed down to one kind.
 */
export enum NotificationType {
  /** Someone sent you a chat message. */
  MESSAGE = "MESSAGE",
  /** A land owner sent you a contact request. */
  INQUIRY = "INQUIRY",
  /** A proposal arrived on your brief, or yours was accepted/declined. */
  PROPOSAL = "PROPOSAL",
  /** A design contract moved on — a submission, a review, a cancellation. */
  CONTRACT = "CONTRACT",
  /** Money moved: concept fee, escrow deposit, escrow release. */
  PAYMENT = "PAYMENT",
  /** A marketplace order was placed, confirmed, delivered, or cancelled. */
  ORDER = "ORDER",
  /** A supervisor decided your verification request. */
  VERIFICATION = "VERIFICATION",
  /** You missed a call. */
  CALL = "CALL",
  /** A meeting was booked, rescheduled, cancelled, or its venue moved on. */
  MEETING = "MEETING",
  /** A site diary entry was logged on a project you're on. */
  SITE_DIARY = "SITE_DIARY",
  /** A tender opened, closed, or was awarded. */
  TENDER = "TENDER",
  /** A bid landed on your tender, or yours was shortlisted/awarded/rejected. */
  BID = "BID",
  /** A milestone was funded, claimed done, inspected, or released. */
  MILESTONE = "MILESTONE",
  /** A marketing announcement sent by an admin. */
  PROMOTION = "PROMOTION",
  /** A platform-wide notice sent by an admin (maintenance, policy, …). */
  SYSTEM = "SYSTEM",
}

/**
 * Who an admin broadcast goes to: everyone, or just the users holding one
 * role. Stored as a string so `"ALL"` and the role names share one field.
 */
export const BROADCAST_ALL = "ALL";
export type BroadcastAudience = UserRole | typeof BROADCAST_ALL;

/**
 * Lifecycle of a structural engineering engagement (plan §4.1 step 08).
 *
 * Shorter than the architect's ContractStatus on purpose: an engineer works
 * from an already-approved design, so there is no concept-brief stage to pay
 * for or review. Escrow in, drawings, approval, done.
 */
export enum StructuralStatus {
  /** Appointed, waiting for the owner to fund the escrow. */
  AWAITING_ESCROW = "AWAITING_ESCROW",
  /** Funded — the engineer submits drawings, the owner reviews them. */
  DRAWINGS_IN_PROGRESS = "DRAWINGS_IN_PROGRESS",
  /** Owner approved the set; escrow released and the project moves to permits. */
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/**
 * The trades counted in a site diary's daily headcount. Deliberately the coarse
 * list a site supervisor would actually call out at muster — finer job titles
 * exist, but nobody counting heads at 8am distinguishes them.
 */
export enum LabourTrade {
  MASON = "MASON",
  HELPER = "HELPER",
  /** Rod/rebar binder — "rod mistri" on a Bangladeshi site. */
  STEEL_FIXER = "STEEL_FIXER",
  CARPENTER = "CARPENTER",
  ELECTRICIAN = "ELECTRICIAN",
  PLUMBER = "PLUMBER",
  PAINTER = "PAINTER",
  OPERATOR = "OPERATOR",
  SUPERVISOR = "SUPERVISOR",
  OTHER = "OTHER",
}

/**
 * Which Open-Meteo endpoint a weather snapshot came from. Worth storing: the
 * forecast endpoint covers today and the recent past from a live model, while
 * the archive is reanalysis data that lags a few days behind. A reader deciding
 * how much to trust a number should be able to see which one answered.
 */
export enum WeatherSource {
  FORECAST = "FORECAST",
  ARCHIVE = "ARCHIVE",
}

/** How a booked meeting is held. */
export enum MeetingMode {
  /** Over Buildora's built-in video call. */
  ONLINE = "ONLINE",
  /** Face to face — at the architect's office, or somewhere both sides agree. */
  IN_PERSON = "IN_PERSON",
}

/**
 * Lifecycle of a booked meeting.
 *
 * There is deliberately no "COMPLETED": a meeting is over when its end time has
 * passed, which the clock already tells us. Storing it would mean a background
 * job to flip the flag, and a status that lies whenever that job is down.
 */
export enum MeetingStatus {
  /**
   * The time is locked in but the *place* isn't: someone proposed a venue other
   * than the office and the other side hasn't answered yet. The slot is held,
   * so nobody else can take it while the two sides agree.
   */
  PENDING_VENUE = "PENDING_VENUE",
  /** Time and place both settled — the only state offered as a calendar export. */
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
}
