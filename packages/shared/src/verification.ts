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

export const MEMBERSHIP_STATUSES = ["Active", "Provisional", "Expired"] as const;

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
