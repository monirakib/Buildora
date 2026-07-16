import type { ProfessionalProfile, SessionUser, SkillEntry } from "@buildora/shared";
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
    yearsExperience: p.yearsExperience?.toString() ?? "",
    bio: p.bio ?? "",
    languages: p.languages ?? "",
    website: p.website ?? "",
    linkedin: p.linkedin ?? "",
    // Carried through unchanged — edited elsewhere / by other roles.
    specialties: p.specialties ?? "",
    // Step 3 — License ("IAB" is the default authority for architects)
    licenseAuthority: p.licenseAuthority || "IAB",
    licenseNumber: p.licenseNumber ?? "",
    membershipStatus: p.membershipStatus ?? "",
    licenseIssueDate: p.licenseIssueDate ?? "",
    licenseExpiryDate: p.licenseExpiryDate ?? "",
    iabCertificateUrl: p.iabCertificateUrl ?? "",
    membershipCardUrl: p.membershipCardUrl ?? "",
    rajukEnlistmentNo: p.rajukEnlistmentNo ?? "",
    rajukCertificateUrl: p.rajukCertificateUrl ?? "",
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
    // Step 10 — Declaration (three checkboxes; all must be ticked)
    agreeTruth: p.declarationAgreed ?? false,
    agreeIabCheck: p.declarationAgreed ?? false,
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
    languages: form.languages || undefined,
    linkedin: form.linkedin || undefined,
    membershipStatus: form.membershipStatus || undefined,
    licenseIssueDate: form.licenseIssueDate || undefined,
    licenseExpiryDate: form.licenseExpiryDate || undefined,
    iabCertificateUrl: form.iabCertificateUrl || undefined,
    membershipCardUrl: form.membershipCardUrl || undefined,
    rajukEnlistmentNo: form.rajukEnlistmentNo || undefined,
    rajukCertificateUrl: form.rajukCertificateUrl || undefined,
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
    declarationAgreed: form.agreeTruth && form.agreeIabCheck && form.agreeSuspension,
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
}

/** The PATCH body: the profile plus the two account-level fields. */
export function toPayload(form: WizardForm): ProfessionalProfileInput {
  return {
    ...toProfile(form),
    name: form.name,
    phone: form.phone,
  } as ProfessionalProfileInput;
}
