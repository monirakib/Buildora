import { UserRole } from "./enums";
import type { ProfessionalProfile, SkillLevel } from "./types";

/** Expertise chips offered on the architect verification wizard (step 6). */
export const EXPERTISE_AREAS = [
  "Residential",
  "Commercial",
  "Industrial",
  "Hospital",
  "Educational",
  "Landscape",
  "Interior",
  "Urban Planning",
  "Mixed Use",
  "High Rise",
  "Hospitality",
  "Conservation",
] as const;

/** Technical-skill cards offered on the wizard (step 7). */
export const SKILL_OPTIONS = [
  "AutoCAD",
  "Revit",
  "SketchUp",
  "Lumion",
  "Rhino",
  "3ds Max",
  "ETABS",
  "SAFE",
  "BIM",
  "Photoshop",
  "Illustrator",
] as const;

export const SKILL_LEVELS: SkillLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Freelance"] as const;

// ---------------------------------------------------------------------------
// Per-profession vocabulary
//
// Each of the four professional roles is verified against the credentials its
// own trade actually issues: architects answer to IAB, engineers to IEB, and
// contractors and suppliers are businesses — their "licence" is a city
// corporation trade licence plus NBR tax registration. The lists below are what
// each role's wizard offers; the role-aware helpers underneath (expertiseFor,
// skillOptionsFor, credentialFor) are what the UI and the API both read, so
// neither side can drift from the other.
// ---------------------------------------------------------------------------

/** Structural work an engineer takes on — the engineer's expertise chips. */
export const ENGINEER_EXPERTISE = [
  "RCC Design",
  "Steel Structure",
  "Foundation & Piling",
  "Seismic Design",
  "Retrofitting",
  "Soil & Geotechnical",
  "High Rise",
  "Bridge & Culvert",
  "Industrial Shed",
  "Structural Audit",
  "Site Supervision",
  "Formwork Design",
] as const;

/** Packages a contractor bids for — the contractor's expertise chips. */
export const CONTRACTOR_WORK_AREAS = [
  "Substructure & Piling",
  "RCC Superstructure",
  "Masonry & Plaster",
  "Finishing",
  "Electrical",
  "Plumbing & Sanitary",
  "HVAC",
  "Lift Installation",
  "Aluminium & Glazing",
  "Interior Fit-out",
  "Renovation",
  "Demolition",
] as const;

/**
 * A supplier's expertise is the material lines they stock, which the wizard
 * captures as ProductCategory values in `supplyCategories` rather than as free
 * chips — that way a verified supplier's declared lines and their marketplace
 * listings are the same vocabulary.
 */
export const SUPPLIER_EXPERTISE = [] as const;

/** Analysis and design software a structural engineer works in. */
export const ENGINEER_SKILL_OPTIONS = [
  "ETABS",
  "SAFE",
  "STAAD.Pro",
  "SAP2000",
  "Prokon",
  "Tekla",
  "GeoStudio",
  "AutoCAD",
  "Revit",
  "Excel design sheets",
] as const;

/** Planning, measurement and quality tools a contractor's office runs on. */
export const CONTRACTOR_SKILL_OPTIONS = [
  "MS Project",
  "Primavera P6",
  "AutoCAD",
  "BOQ & rate analysis",
  "Total Station",
  "QA/QC inspection",
  "Safety (HSE)",
  "Excel scheduling",
] as const;

/**
 * IEB membership grades. "Life" grades are separate rows because IEB issues
 * them as distinct memberships, not as a status on an ordinary one.
 */
export const IEB_MEMBERSHIP_CATEGORIES = [
  "Fellow",
  "Life Fellow",
  "Member",
  "Life Member",
  "Associate Member",
  "Student Member",
] as const;

/** Standing of an IEB membership — simpler than IAB's six-way list. */
export const IEB_MEMBERSHIP_STATUSES = ["Active", "Lapsed", "Suspended"] as const;

/** Bodies that enlist contractors, and whose class a contractor quotes. */
export const ENLISTMENT_BODIES = [
  "RAJUK",
  "PWD (Public Works Department)",
  "LGED",
  "RHD (Roads & Highways)",
  "City Corporation",
  "Other",
] as const;

/**
 * Enlistment classes, best first. The class caps the contract value a
 * contractor may tender for, so an owner comparing bids cares about it.
 */
export const CONTRACTOR_CLASSES = [
  "Class A",
  "Class B",
  "Class C",
  "Class D",
  "Not enlisted",
] as const;

/** Plant a contractor may own or hire in — chips on the capacity step. */
export const EQUIPMENT_OPTIONS = [
  "Concrete mixer",
  "Batching plant",
  "Concrete pump",
  "Needle vibrator",
  "Scaffolding",
  "Tower crane",
  "Mobile crane",
  "Excavator",
  "Piling rig",
  "Bar bending machine",
  "Truck / tipper",
  "Generator",
  "Total station",
  "Dewatering pump",
] as const;

/**
 * The six standings the IAB directory tracks, in the order its own filter
 * lists them. "Regular" is the only one that means a valid, practising
 * membership — see isRegularIabStatus.
 */
export const MEMBERSHIP_STATUSES = [
  "Regular",
  "Irregular",
  "Foreign Chapter",
  "Inactive",
  "Suspended",
  "Deceased",
] as const;

/**
 * The six membership tiers in the IAB Constitution and By-Laws, most senior
 * first. Fellow and Member are full architects; Associate and Student are not
 * yet, which is why the supervisor is shown the tier and not just the standing.
 */
export const MEMBERSHIP_CATEGORIES = [
  "Fellow",
  "Member",
  "Associate Member",
  "Student Member",
  "Honorary Fellow",
  "Honorary Member",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type MembershipCategory = (typeof MEMBERSHIP_CATEGORIES)[number];

/**
 * The directory writes these in lower case and in its own shorthand — the card
 * for an associate member just says "associate", and a foreign member says
 * "foreign". These two functions turn that shorthand into the official label so
 * the whole app displays one vocabulary.
 *
 * The two-word tiers are tested first: "honorary fellow" also contains
 * "fellow", so checking the shorter one first would mislabel it.
 */
export function iabStatusLabel(raw: string | undefined): MembershipStatus | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (value.startsWith("foreign")) return "Foreign Chapter";
  return MEMBERSHIP_STATUSES.find((s) => s.toLowerCase() === value);
}

export function iabCategoryLabel(raw: string | undefined): MembershipCategory | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (value.includes("honorary")) {
    return value.includes("fellow") ? "Honorary Fellow" : "Honorary Member";
  }
  if (value.startsWith("associate")) return "Associate Member";
  if (value.startsWith("student")) return "Student Member";
  if (value.startsWith("fellow")) return "Fellow";
  if (value.startsWith("member")) return "Member";
  return undefined;
}

/** Only "regular" means a membership in good standing. */
export function isRegularIabStatus(raw: string | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "regular";
}

// ---------------------------------------------------------------------------
// IAB membership numbers and names
//
// These live in shared because three places must agree on them: the signup
// form, the verification wizard, and the API — which re-runs the same check at
// submit time so the browser's answer can't be the one that counts.
// ---------------------------------------------------------------------------

/**
 * Every number in the IAB directory reads as one or two letters, a dash and
 * three or four digits: "AA-920", "S-098", "SH-044". The leading letters encode
 * the grade and surname, so they can't be derived — they must be typed right.
 */
const MEMBERSHIP_NO = /^[A-Z]{1,2}-\d{3,4}$/;

/**
 * Tidies what was typed into the directory's own spelling: upper case, no
 * spaces, and the dash put back when it was left out ("aa920" → "AA-920").
 * Returns undefined when the result still isn't a membership number.
 */
export function normalizeMembershipNo(raw: string): string | undefined {
  const cleaned = raw.toUpperCase().replace(/[\s_]/g, "");
  const withDash = cleaned.includes("-")
    ? cleaned
    : cleaned.replace(/^([A-Z]{1,2})(\d{3,4})$/, "$1-$2");
  return MEMBERSHIP_NO.test(withDash) ? withDash : undefined;
}

/**
 * Titles and honorifics that appear in front of a name without being part of
 * it. "Md" is on the list because most Bangladeshi male names in the directory
 * carry it, and people leave it off when signing up. Genuine name components
 * that only look like titles (Syed, Sheikh, Khan) are deliberately absent.
 */
const HONORIFICS = new Set([
  "md",
  "mohammad",
  "mohammed",
  "muhammad",
  "mohd",
  "mst",
  "most",
  "mosammat",
  "begum",
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "engr",
  "eng",
  "ar",
]);

/**
 * Reduces a name to the words that actually identify a person.
 *
 * The directory's names are entered by hand and come back messy — "Md. Nour
 * Alam" with a double space, "MD.MAZHARUL ISLAM CHOWDHURY" with no space after
 * the dot, "S. M. Forhad Hafiz Nishu" with initials. Splitting on anything
 * that isn't a letter or digit absorbs all of that. Single letters are dropped
 * because they're initials, which carry no signal and only ever cause a real
 * person's name to look different from their own directory entry.
 */
function nameTokens(name: string): Set<string> {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !HONORIFICS.has(w));
  return new Set(words);
}

/**
 * Whether an account name and an IAB directory name plausibly belong to the
 * same person.
 *
 * One name's words being contained in the other's counts as a match, so
 * "Nour Alam" matches "Md. Nour Alam" and "Mazharul Islam" matches
 * "MD.MAZHARUL ISLAM CHOWDHURY". This is deliberately forgiving: a false
 * mismatch blocks a real architect from submitting, while a false match only
 * means the supervisor does the comparison by eye — which they do anyway.
 */
export function iabNameMatches(accountName: string, directoryName: string): boolean {
  const account = nameTokens(accountName);
  const directory = nameTokens(directoryName);
  if (account.size === 0 || directory.size === 0) return false;

  const contains = (big: Set<string>, small: Set<string>) =>
    [...small].every((word) => big.has(word));
  return contains(directory, account) || contains(account, directory);
}

// ---------------------------------------------------------------------------
// Business registration numbers (contractors and suppliers)
//
// The same rule as NID applies here: none of this proves a licence exists. NBR
// publishes no free lookup for a BIN or a TIN, and trade licences are issued by
// ~330 separate city corporations and pourashavas with no shared register. So
// these only catch typos and wrong-length numbers, which is still worth doing —
// it keeps the supervisor's time for the documents that need human eyes.
// ---------------------------------------------------------------------------

/** Shared result shape for every credential-number check. */
export interface CredentialFormatResult {
  ok: boolean;
  /** Cleaned-up value, as it should be stored. */
  normalized: string;
  /** Why it failed, ready to show in a form. */
  issue?: string;
}

const digitsOnly = (raw: string) => (raw ?? "").replace(/\D/g, "");

/**
 * NBR's Business Identification Number (VAT registration) is 13 digits. It's
 * usually written 000123456-0101, so the separators are stripped first.
 */
export function checkBin(raw: string): CredentialFormatResult {
  const normalized = digitsOnly(raw);
  if (normalized === "") return { ok: false, normalized, issue: "Enter your BIN" };
  if (normalized.length !== 13) {
    return {
      ok: false,
      normalized,
      issue: `A BIN is 13 digits — this one has ${normalized.length}`,
    };
  }
  return { ok: true, normalized };
}

/** NBR's e-TIN is 12 digits. */
export function checkTin(raw: string): CredentialFormatResult {
  const normalized = digitsOnly(raw);
  if (normalized === "") return { ok: false, normalized, issue: "Enter your TIN" };
  if (normalized.length !== 12) {
    return {
      ok: false,
      normalized,
      issue: `An e-TIN is 12 digits — this one has ${normalized.length}`,
    };
  }
  return { ok: true, normalized };
}

/**
 * Trade licence numbers have no national format — every issuing authority
 * numbers its own way — so this only rejects what can't be a licence number at
 * all: too short, or containing characters no register uses.
 */
export function checkTradeLicenseNo(raw: string): CredentialFormatResult {
  const normalized = (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === "") {
    return { ok: false, normalized, issue: "Enter your trade licence number" };
  }
  if (normalized.length < 4) {
    return { ok: false, normalized, issue: "A trade licence number is at least 4 characters" };
  }
  if (!/^[A-Z0-9][A-Z0-9\-/ ]*$/.test(normalized)) {
    return {
      ok: false,
      normalized,
      issue: "Use only letters, digits, dashes and slashes",
    };
  }
  return { ok: true, normalized };
}

/**
 * IEB membership numbers appear as plain serials and as graded ones ("M/12345",
 * "F-3421"), and IEB publishes no format specification, so this stays
 * permissive on purpose — a stricter rule would reject real engineers.
 */
export function checkIebMembershipNo(raw: string): CredentialFormatResult {
  const normalized = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (normalized === "") {
    return { ok: false, normalized, issue: "Enter your IEB membership number" };
  }
  if (!/^[A-Z0-9][A-Z0-9\-/]{2,19}$/.test(normalized)) {
    return {
      ok: false,
      normalized,
      issue: "IEB numbers look like 12345, M/12345 or F-3421",
    };
  }
  return { ok: true, normalized };
}

/**
 * Whether an ISO "YYYY-MM-DD" expiry has already passed. `undefined` when
 * there's no date to judge — "not checked", not "still valid".
 */
export function isExpired(date: string | undefined, now = new Date()): boolean | undefined {
  const value = (date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const when = new Date(`${value}T23:59:59`);
  if (Number.isNaN(when.getTime())) return undefined;
  return when.getTime() < now.getTime();
}

// ---------------------------------------------------------------------------
// Role-aware wizard configuration
// ---------------------------------------------------------------------------

/** What each role's primary credential is called, wherever it's shown. */
export interface RoleCredential {
  /** Registering body, pre-filled as the profile's `licenseAuthority`. */
  authority: string;
  /** e.g. "IAB membership number" — the label on `licenseNumber`. */
  numberLabel: string;
  /** e.g. "IAB certificate" — the primary document upload. */
  certificateLabel: string;
}

export function credentialFor(role: UserRole): RoleCredential {
  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return {
        authority: "IEB",
        numberLabel: "IEB membership number",
        certificateLabel: "IEB certificate",
      };
    case UserRole.CONTRACTOR:
    case UserRole.SUPPLIER:
      return {
        authority: "City Corporation",
        numberLabel: "Trade licence number",
        certificateLabel: "Trade licence",
      };
    default:
      return {
        authority: "IAB",
        numberLabel: "IAB membership number",
        certificateLabel: "IAB certificate",
      };
  }
}

/** The expertise chips a role picks from. */
export function expertiseFor(role: UserRole): readonly string[] {
  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return ENGINEER_EXPERTISE;
    case UserRole.CONTRACTOR:
      return CONTRACTOR_WORK_AREAS;
    case UserRole.SUPPLIER:
      return SUPPLIER_EXPERTISE;
    default:
      return EXPERTISE_AREAS;
  }
}

/** True for any chip offered to any role — used to validate directory filters. */
export function isKnownExpertise(value: string): boolean {
  const all: readonly string[][] = [
    EXPERTISE_AREAS as unknown as string[],
    ENGINEER_EXPERTISE as unknown as string[],
    CONTRACTOR_WORK_AREAS as unknown as string[],
  ];
  return all.some((list) => list.includes(value));
}

/** The software/tool cards a role picks from; empty means "skip that step". */
export function skillOptionsFor(role: UserRole): readonly string[] {
  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return ENGINEER_SKILL_OPTIONS;
    case UserRole.CONTRACTOR:
      return CONTRACTOR_SKILL_OPTIONS;
    case UserRole.SUPPLIER:
      return [];
    default:
      return SKILL_OPTIONS;
  }
}

/** Membership grades offered on the licence step, by role. */
export function membershipCategoriesFor(role: UserRole): readonly string[] {
  return role === UserRole.STRUCTURAL_ENGINEER ? IEB_MEMBERSHIP_CATEGORIES : MEMBERSHIP_CATEGORIES;
}

/** Membership standings offered on the licence step, by role. */
export function membershipStatusesFor(role: UserRole): readonly string[] {
  return role === UserRole.STRUCTURAL_ENGINEER ? IEB_MEMBERSHIP_STATUSES : MEMBERSHIP_STATUSES;
}

/** One row of the completion checklist. */
export interface CompletionItem {
  /** Shown in the UI, e.g. "NID front image". */
  label: string;
  done: boolean;
  /** Mandatory items gate the "Submit for verification" button. */
  mandatory: boolean;
}

export interface CompletionResult {
  /** 0–100, over every checklist item (mandatory and optional). */
  percent: number;
  items: CompletionItem[];
  /** True once every mandatory item is done — submission is allowed. */
  mandatoryComplete: boolean;
  /** Labels of the mandatory items still missing (for error messages). */
  missingMandatory: string[];
}

const filled = (s: string | undefined) => typeof s === "string" && s.trim() !== "";

/**
 * Single source of truth for the wizard's completion state. The web app uses
 * it for the live percentage and to enable the submit button; the API runs the
 * same function at submit time so the mandatory rules can't be bypassed.
 *
 * Every role shares an identity block (photo + NID card) and a signed
 * declaration, then diverges: what counts as a credential for an architect is
 * an IAB membership, for an engineer an IEB membership and a professional seal,
 * and for a contractor or a supplier a trade licence and a tax registration.
 * The role's own checklist is what gates their submit button.
 */
export function computeCompletion(
  profile: ProfessionalProfile | undefined,
  role: UserRole
): CompletionResult {
  const p = profile ?? {};

  // At least one degree that has its certificate uploaded.
  const hasCertifiedDegree = (p.education ?? []).some(
    (e) => filled(e.degree) && filled(e.institution) && filled(e.certificateUrl)
  );
  // At least one portfolio project with a photo.
  const hasPortfolioProject = (p.portfolio ?? []).some(
    (pr) => filled(pr.title) && pr.imageUrls.length > 0
  );

  // Shared by all four roles: who you are, and that you signed for it.
  const identity: CompletionItem[] = [
    { label: "Profile photo", done: filled(p.avatarUrl), mandatory: true },
    { label: "NID number", done: filled(p.nid), mandatory: true },
    { label: "NID front image", done: filled(p.nidFrontUrl), mandatory: true },
    { label: "NID back image", done: filled(p.nidBackUrl), mandatory: true },
  ];
  const declaration: CompletionItem = {
    label: "Signed declaration",
    done: p.declarationAgreed === true && filled(p.declarationSignature),
    mandatory: true,
  };

  // Optional rows every role is scored on. They never block submission; they
  // only move the completion percentage, which is what nudges people to fill
  // a profile out properly.
  const commonOptional: CompletionItem[] = [
    { label: "Date of birth", done: filled(p.dateOfBirth), mandatory: false },
    { label: "Current address", done: filled(p.currentAddress), mandatory: false },
    { label: "About yourself", done: filled(p.bio), mandatory: false },
    { label: "Years of experience", done: typeof p.yearsExperience === "number", mandatory: false },
    { label: "Achievements", done: (p.achievements ?? []).length > 0, mandatory: false },
  ];

  let roleItems: CompletionItem[];

  switch (role) {
    // A structural engineer signs off the milestone inspections that release
    // escrow, so their degree and their seal are non-negotiable — those two are
    // what makes a signature mean anything.
    case UserRole.STRUCTURAL_ENGINEER:
      roleItems = [
        { label: "IEB membership number", done: filled(p.licenseNumber), mandatory: true },
        { label: "IEB certificate", done: filled(p.licenseCertificateUrl), mandatory: true },
        { label: "Engineering degree with certificate", done: hasCertifiedDegree, mandatory: true },
        {
          label: "Professional seal / stamp",
          done: filled(p.professionalSealUrl),
          mandatory: true,
        },
        { label: "Work experience", done: (p.experience ?? []).length > 0, mandatory: true },
        { label: "Professional title", done: filled(p.professionalTitle), mandatory: false },
        { label: "Membership grade", done: filled(p.membershipCategory), mandatory: false },
        { label: "RAJUK enlistment number", done: filled(p.rajukEnlistmentNo), mandatory: false },
        { label: "Structural expertise", done: (p.expertise ?? []).length > 0, mandatory: false },
        { label: "Analysis software", done: (p.skills ?? []).length > 0, mandatory: false },
        { label: "Past projects", done: hasPortfolioProject, mandatory: false },
      ];
      break;

    // A contractor is a business before it is a person: the trade licence and
    // the TIN are what a payout can legally be made against, and the completed
    // builds are what an owner compares when awarding a tender.
    case UserRole.CONTRACTOR:
      roleItems = [
        { label: "Firm name", done: filled(p.company), mandatory: true },
        { label: "Trade licence number", done: filled(p.tradeLicenseNo), mandatory: true },
        { label: "Trade licence document", done: filled(p.tradeLicenseUrl), mandatory: true },
        { label: "TIN number", done: filled(p.tinNumber), mandatory: true },
        { label: "TIN certificate", done: filled(p.tinCertificateUrl), mandatory: true },
        { label: "Completed project with photo", done: hasPortfolioProject, mandatory: true },
        { label: "BIN (VAT registration)", done: filled(p.binNumber), mandatory: false },
        { label: "RJSC incorporation", done: filled(p.rjscRegistrationNo), mandatory: false },
        { label: "Enlistment class", done: filled(p.contractorClass), mandatory: false },
        { label: "Crew size", done: typeof p.crewSize === "number", mandatory: false },
        { label: "Equipment owned", done: (p.equipment ?? []).length > 0, mandatory: false },
        { label: "Bank solvency certificate", done: filled(p.bankSolvencyUrl), mandatory: false },
        { label: "Work packages", done: (p.expertise ?? []).length > 0, mandatory: false },
      ];
      break;

    // A supplier's verification is about what they can actually deliver and
    // from where — categories and a real warehouse address, on top of the same
    // business registration a contractor needs.
    case UserRole.SUPPLIER:
      roleItems = [
        { label: "Business name", done: filled(p.company), mandatory: true },
        { label: "Trade licence number", done: filled(p.tradeLicenseNo), mandatory: true },
        { label: "Trade licence document", done: filled(p.tradeLicenseUrl), mandatory: true },
        { label: "TIN number", done: filled(p.tinNumber), mandatory: true },
        {
          label: "Material categories",
          done: (p.supplyCategories ?? []).length > 0,
          mandatory: true,
        },
        { label: "Warehouse / outlet address", done: filled(p.warehouseAddress), mandatory: true },
        { label: "TIN certificate", done: filled(p.tinCertificateUrl), mandatory: false },
        { label: "BIN (VAT registration)", done: filled(p.binNumber), mandatory: false },
        { label: "RJSC incorporation", done: filled(p.rjscRegistrationNo), mandatory: false },
        {
          label: "Brand authorisation",
          done: (p.brandAuthorizations ?? []).length > 0,
          mandatory: false,
        },
        { label: "BSTI licence", done: filled(p.bstiLicenseNo), mandatory: false },
        {
          label: "Delivery districts",
          done: (p.deliveryDistricts ?? []).length > 0,
          mandatory: false,
        },
      ];
      break;

    // Architect — the original checklist, unchanged.
    default:
      roleItems = [
        { label: "IAB membership number", done: filled(p.licenseNumber), mandatory: true },
        { label: "IAB certificate", done: filled(p.iabCertificateUrl), mandatory: true },
        { label: "Degree with certificate", done: hasCertifiedDegree, mandatory: true },
        { label: "Portfolio project with photo", done: hasPortfolioProject, mandatory: true },
        { label: "Professional title", done: filled(p.professionalTitle), mandatory: false },
        { label: "Work experience", done: (p.experience ?? []).length > 0, mandatory: false },
        { label: "Areas of expertise", done: (p.expertise ?? []).length > 0, mandatory: false },
        { label: "Technical skills", done: (p.skills ?? []).length > 0, mandatory: false },
      ];
      break;
  }

  const items = [...identity, ...roleItems, declaration, ...commonOptional];
  const doneCount = items.filter((i) => i.done).length;
  const missingMandatory = items.filter((i) => i.mandatory && !i.done).map((i) => i.label);

  return {
    percent: Math.round((doneCount / items.length) * 100),
    items,
    mandatoryComplete: missingMandatory.length === 0,
    missingMandatory,
  };
}
