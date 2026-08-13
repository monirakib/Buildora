import {
  UserRole,
  type ProfessionalProfile,
  type SessionUser,
  type SkillEntry,
} from "@buildora/shared";
import type { ProfessionalProfileInput } from "@/lib/api";

// Every field is edited as a string (same convention as the rest of the app);
// numbers are converted right before the save request.

export const emptyEducation = {
  degree: "",
  institution: "",
  department: "",
  year: "",
  cgpa: "",
  certificateUrl: "",
  transcriptUrl: "",
};

export const emptyExperience = {
  company: "",
  designation: "",
  employmentType: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  description: "",
};

export const emptyProject = {
  title: "",
  location: "",
  year: "",
  buildingType: "",
  client: "",
  areaSqft: "",
  budgetBdt: "",
  role: "",
  description: "",
  imageUrls: [] as string[],
};

export const emptyAchievement = { title: "", year: "", description: "" };

export const emptyBrandAuthorization = { brand: "", documentUrl: "", validTill: "" };

/**
 * The default registering body for a role, pre-filled on a blank profile.
 * Contractors and suppliers aren't licensed by a professional institute — their
 * licence comes from the local authority — so they get that as the authority.
 */
function defaultAuthority(role: UserRole): string {
  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return "IEB";
    case UserRole.CONTRACTOR:
    case UserRole.SUPPLIER:
      return "City Corporation";
    default:
      return "IAB";
  }
}

/** The whole wizard form — one flat object so autosave can send it in one PATCH. */
export function formFromUser(user: SessionUser) {
  const p = (user.profile ?? {}) as ProfessionalProfile;
  return {
    // Step 1 — Identity
    avatarUrl: p.avatarUrl ?? "",
    name: user.name,
    dateOfBirth: p.dateOfBirth ?? "",
    gender: p.gender ?? "",
    phone: user.phone ?? "",
    currentAddress: p.currentAddress ?? "",
    permanentAddress: p.permanentAddress ?? "",
    nid: p.nid ?? "",
    nidFrontUrl: p.nidFrontUrl ?? "",
    nidBackUrl: p.nidBackUrl ?? "",
    // Step 2 — Professional
    professionalTitle: p.professionalTitle ?? "",
    company: p.company ?? "",
    isIndependent: p.isIndependent ?? false,
    officeAddress: p.officeAddress ?? "",
    practiceDivision: p.practiceDivision ?? "",
    practiceDistrict: p.practiceDistrict ?? "",
    yearsExperience: p.yearsExperience?.toString() ?? "",
    bio: p.bio ?? "",
    portfolioTitle: p.portfolioTitle ?? "",
    portfolioIntro: p.portfolioIntro ?? "",
    languages: p.languages ?? "",
    website: p.website ?? "",
    linkedin: p.linkedin ?? "",
    // Carried through unchanged — edited elsewhere / by other roles.
    specialties: p.specialties ?? "",
    // License — the registering body differs per profession, so the default
    // authority follows the role rather than always being IAB.
    licenseAuthority: p.licenseAuthority || defaultAuthority(user.role),
    licenseNumber: p.licenseNumber ?? "",
    membershipStatus: p.membershipStatus ?? "",
    membershipCategory: p.membershipCategory ?? "",
    licenseIssueDate: p.licenseIssueDate ?? "",
    licenseExpiryDate: p.licenseExpiryDate ?? "",
    iabCertificateUrl: p.iabCertificateUrl ?? "",
    licenseCertificateUrl: p.licenseCertificateUrl ?? "",
    membershipCardUrl: p.membershipCardUrl ?? "",
    rajukEnlistmentNo: p.rajukEnlistmentNo ?? "",
    rajukCertificateUrl: p.rajukCertificateUrl ?? "",
    // Structural engineer — the seal their inspection signature carries
    professionalSealUrl: p.professionalSealUrl ?? "",
    // Business registration (contractor & supplier)
    tradeLicenseNo: p.tradeLicenseNo ?? "",
    tradeLicenseIssuer: p.tradeLicenseIssuer ?? "",
    tradeLicenseExpiry: p.tradeLicenseExpiry ?? "",
    tradeLicenseUrl: p.tradeLicenseUrl ?? "",
    binNumber: p.binNumber ?? "",
    binCertificateUrl: p.binCertificateUrl ?? "",
    tinNumber: p.tinNumber ?? "",
    tinCertificateUrl: p.tinCertificateUrl ?? "",
    rjscRegistrationNo: p.rjscRegistrationNo ?? "",
    rjscCertificateUrl: p.rjscCertificateUrl ?? "",
    // Contractor capacity
    enlistmentBody: p.enlistmentBody ?? "",
    contractorClass: p.contractorClass ?? "",
    enlistmentCertificateUrl: p.enlistmentCertificateUrl ?? "",
    crewSize: p.crewSize?.toString() ?? "",
    equipment: p.equipment ?? [],
    largestProjectBdt: p.largestProjectBdt?.toString() ?? "",
    bankSolvencyUrl: p.bankSolvencyUrl ?? "",
    // Supplier catalogue & coverage
    supplyCategories: p.supplyCategories ?? [],
    brandAuthorizations: (p.brandAuthorizations ?? []).map((b) => ({
      brand: b.brand,
      documentUrl: b.documentUrl ?? "",
      validTill: b.validTill ?? "",
    })),
    warehouseAddress: p.warehouseAddress ?? "",
    warehouseLocation: p.warehouseLocation ?? null,
    deliveryDistricts: p.deliveryDistricts ?? [],
    bstiLicenseNo: p.bstiLicenseNo ?? "",
    bstiCertificateUrl: p.bstiCertificateUrl ?? "",
    // Steps 4–9 — lists
    education: (p.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
      department: e.department ?? "",
      year: e.year?.toString() ?? "",
      cgpa: e.cgpa ?? "",
      certificateUrl: e.certificateUrl ?? "",
      transcriptUrl: e.transcriptUrl ?? "",
    })),
    experience: (p.experience ?? []).map((x) => ({
      company: x.company,
      designation: x.designation,
      employmentType: x.employmentType ?? "",
      startDate: x.startDate ?? "",
      endDate: x.endDate ?? "",
      isCurrent: x.isCurrent ?? false,
      description: x.description ?? "",
    })),
    expertise: p.expertise ?? [],
    skills: (p.skills ?? []) as SkillEntry[],
    portfolio: (p.portfolio ?? []).map((pr) => ({
      title: pr.title,
      location: pr.location ?? "",
      year: pr.year?.toString() ?? "",
      buildingType: pr.buildingType ?? "",
      client: pr.client ?? "",
      areaSqft: pr.areaSqft?.toString() ?? "",
      budgetBdt: pr.budgetBdt?.toString() ?? "",
      role: pr.role ?? "",
      description: pr.description ?? "",
      imageUrls: pr.imageUrls ?? [],
    })),
    achievements: (p.achievements ?? []).map((a) => ({
      title: a.title,
      year: a.year?.toString() ?? "",
      description: a.description ?? "",
    })),
    // Declaration (three checkboxes; all must be ticked). The middle one is
    // consent to check with whichever body registers this profession.
    agreeTruth: p.declarationAgreed ?? false,
    agreeBodyCheck: p.declarationAgreed ?? false,
    agreeSuspension: p.declarationAgreed ?? false,
    declarationSignature: p.declarationSignature ?? "",
    declarationSignedAt: p.declarationSignedAt ?? "",
  };
}

export type WizardForm = ReturnType<typeof formFromUser>;

const num = (s: string) => (s === "" ? undefined : Number(s));

/** Converts the string-based form into the profile shape used for the PATCH
 *  payload and for computeCompletion (both need real numbers/booleans). */
export function toProfile(form: WizardForm): ProfessionalProfile {
  return {
    avatarUrl: form.avatarUrl || undefined,
    company: form.company || undefined,
    bio: form.bio || undefined,
    portfolioTitle: form.portfolioTitle || undefined,
    portfolioIntro: form.portfolioIntro || undefined,
    licenseAuthority: form.licenseAuthority || undefined,
    licenseNumber: form.licenseNumber || undefined,
    specialties: form.specialties || undefined,
    yearsExperience: num(form.yearsExperience),
    website: form.website || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    gender: form.gender || undefined,
    currentAddress: form.currentAddress || undefined,
    permanentAddress: form.permanentAddress || undefined,
    nid: form.nid || undefined,
    nidFrontUrl: form.nidFrontUrl || undefined,
    nidBackUrl: form.nidBackUrl || undefined,
    professionalTitle: form.professionalTitle || undefined,
    isIndependent: form.isIndependent,
    officeAddress: form.officeAddress || undefined,
    practiceDivision: form.practiceDivision || undefined,
    practiceDistrict: form.practiceDistrict || undefined,
    languages: form.languages || undefined,
    linkedin: form.linkedin || undefined,
    membershipStatus: form.membershipStatus || undefined,
    membershipCategory: form.membershipCategory || undefined,
    licenseIssueDate: form.licenseIssueDate || undefined,
    licenseExpiryDate: form.licenseExpiryDate || undefined,
    iabCertificateUrl: form.iabCertificateUrl || undefined,
    licenseCertificateUrl: form.licenseCertificateUrl || undefined,
    membershipCardUrl: form.membershipCardUrl || undefined,
    rajukEnlistmentNo: form.rajukEnlistmentNo || undefined,
    rajukCertificateUrl: form.rajukCertificateUrl || undefined,
    professionalSealUrl: form.professionalSealUrl || undefined,
    tradeLicenseNo: form.tradeLicenseNo || undefined,
    tradeLicenseIssuer: form.tradeLicenseIssuer || undefined,
    tradeLicenseExpiry: form.tradeLicenseExpiry || undefined,
    tradeLicenseUrl: form.tradeLicenseUrl || undefined,
    binNumber: form.binNumber || undefined,
    binCertificateUrl: form.binCertificateUrl || undefined,
    tinNumber: form.tinNumber || undefined,
    tinCertificateUrl: form.tinCertificateUrl || undefined,
    rjscRegistrationNo: form.rjscRegistrationNo || undefined,
    rjscCertificateUrl: form.rjscCertificateUrl || undefined,
    enlistmentBody: form.enlistmentBody || undefined,
    contractorClass: form.contractorClass || undefined,
    enlistmentCertificateUrl: form.enlistmentCertificateUrl || undefined,
    crewSize: num(form.crewSize),
    equipment: form.equipment,
    largestProjectBdt: num(form.largestProjectBdt),
    bankSolvencyUrl: form.bankSolvencyUrl || undefined,
    supplyCategories: form.supplyCategories,
    // Rows with no brand typed yet are drafts, not data — drop them so a
    // half-filled card can't fail the save with "Enter the brand name".
    brandAuthorizations: form.brandAuthorizations
      .filter((b) => b.brand.trim() !== "")
      .map((b) => ({
        brand: b.brand,
        documentUrl: b.documentUrl || undefined,
        validTill: b.validTill || undefined,
      })),
    warehouseAddress: form.warehouseAddress || undefined,
    warehouseLocation: form.warehouseLocation ?? undefined,
    deliveryDistricts: form.deliveryDistricts,
    bstiLicenseNo: form.bstiLicenseNo || undefined,
    bstiCertificateUrl: form.bstiCertificateUrl || undefined,
    education: form.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      department: e.department || undefined,
      year: num(e.year),
      cgpa: e.cgpa || undefined,
      certificateUrl: e.certificateUrl || undefined,
      transcriptUrl: e.transcriptUrl || undefined,
    })),
    experience: form.experience.map((x) => ({
      company: x.company,
      designation: x.designation,
      employmentType: x.employmentType || undefined,
      startDate: x.startDate || undefined,
      endDate: x.isCurrent ? undefined : x.endDate || undefined,
      isCurrent: x.isCurrent,
      description: x.description || undefined,
    })),
    expertise: form.expertise,
    skills: form.skills,
    achievements: form.achievements.map((a) => ({
      title: a.title,
      year: num(a.year),
      description: a.description || undefined,
    })),
    portfolio: form.portfolio.map((pr) => ({
      title: pr.title,
      description: pr.description || undefined,
      year: num(pr.year),
      location: pr.location || undefined,
      buildingType: pr.buildingType || undefined,
      client: pr.client || undefined,
      areaSqft: num(pr.areaSqft),
      budgetBdt: num(pr.budgetBdt),
      role: pr.role || undefined,
      imageUrls: pr.imageUrls,
    })),
    declarationAgreed: form.agreeTruth && form.agreeBodyCheck && form.agreeSuspension,
    declarationSignature: form.declarationSignature || undefined,
    declarationSignedAt: form.declarationSignedAt || undefined,
  };
}

/** Props every wizard step receives. */
export interface StepProps {
  form: WizardForm;
  /** Merge a partial update into the form (triggers autosave). */
  patch: (partial: Partial<WizardForm>) => void;
  onError: (message: string) => void;
  /**
   * Which profession is filling this in. Several steps are shared across roles
   * and read this to pick their wording and their option lists — an engineer's
   * expertise chips are not an architect's.
   */
  role: UserRole;
}

/** The PATCH body: the profile plus the two account-level fields. */
export function toPayload(form: WizardForm): ProfessionalProfileInput {
  return {
    ...toProfile(form),
    name: form.name,
    phone: form.phone,
  } as ProfessionalProfileInput;
}
