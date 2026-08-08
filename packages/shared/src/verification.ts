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
 */
export function computeCompletion(profile: ProfessionalProfile | undefined): CompletionResult {
  const p = profile ?? {};

  // At least one degree that has its certificate uploaded.
  const hasCertifiedDegree = (p.education ?? []).some(
    (e) => filled(e.degree) && filled(e.institution) && filled(e.certificateUrl)
  );
  // At least one portfolio project with a photo.
  const hasPortfolioProject = (p.portfolio ?? []).some(
    (pr) => filled(pr.title) && pr.imageUrls.length > 0
  );

  const items: CompletionItem[] = [
    // ---- Mandatory (document requirements from the product spec) ----
    { label: "Profile photo", done: filled(p.avatarUrl), mandatory: true },
    { label: "NID number", done: filled(p.nid), mandatory: true },
    { label: "NID front image", done: filled(p.nidFrontUrl), mandatory: true },
    { label: "NID back image", done: filled(p.nidBackUrl), mandatory: true },
    { label: "IAB membership number", done: filled(p.licenseNumber), mandatory: true },
    { label: "IAB certificate", done: filled(p.iabCertificateUrl), mandatory: true },
    { label: "Degree with certificate", done: hasCertifiedDegree, mandatory: true },
    { label: "Portfolio project with photo", done: hasPortfolioProject, mandatory: true },
    {
      label: "Signed declaration",
      done: p.declarationAgreed === true && filled(p.declarationSignature),
      mandatory: true,
    },
    // ---- Optional (still counted in the percentage) ----
    { label: "Date of birth", done: filled(p.dateOfBirth), mandatory: false },
    { label: "Current address", done: filled(p.currentAddress), mandatory: false },
    { label: "Professional title", done: filled(p.professionalTitle), mandatory: false },
    { label: "About yourself", done: filled(p.bio), mandatory: false },
    {
      label: "Years of experience",
      done: typeof p.yearsExperience === "number",
      mandatory: false,
    },
    { label: "Work experience", done: (p.experience ?? []).length > 0, mandatory: false },
    { label: "Areas of expertise", done: (p.expertise ?? []).length > 0, mandatory: false },
    { label: "Technical skills", done: (p.skills ?? []).length > 0, mandatory: false },
    { label: "Achievements", done: (p.achievements ?? []).length > 0, mandatory: false },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const missingMandatory = items.filter((i) => i.mandatory && !i.done).map((i) => i.label);

  return {
    percent: Math.round((doneCount / items.length) * 100),
    items,
    mandatoryComplete: missingMandatory.length === 0,
    missingMandatory,
  };
}
