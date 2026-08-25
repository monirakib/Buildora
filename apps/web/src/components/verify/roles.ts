import { UserRole } from "@buildora/shared";
import type { WizardForm } from "./form";

/**
 * What each role's verification wizard is made of.
 *
 * Every role runs the same machinery — sidebar, autosave, completion bar,
 * submit — and differs only in this table: which steps they see, in what order,
 * and what the page calls itself. Adding a role means adding a row here, not
 * another wizard.
 */

/** Every step the wizard knows how to render. */
export type StepKey =
  | "identity"
  | "address"
  | "professional"
  | "license"
  | "engineerLicense"
  | "business"
  | "capacity"
  | "catalogue"
  | "coverage"
  | "education"
  | "experience"
  | "expertise"
  | "skills"
  | "portfolio"
  | "achievements"
  | "declaration";

export interface WizardStep {
  key: StepKey;
  /** Short sidebar label. */
  label: string;
}

export interface RoleWizard {
  /** Eyebrow above the page title, e.g. "Buildora · Architect Verification". */
  eyebrow: string;
  /** One line under the title explaining what verification gets them. */
  intro: string;
  /** How the approved badge reads, e.g. "Verified Architect". */
  verifiedLabel: string;
  steps: WizardStep[];
}

const ARCHITECT: RoleWizard = {
  eyebrow: "Architect Verification",
  intro:
    "Submit your credentials for manual verification by a Buildora Supervisor and earn the " +
    "Verified Architect badge.",
  verifiedLabel: "Verified Architect",
  steps: [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "professional", label: "Professional" },
    { key: "license", label: "License" },
    { key: "education", label: "Education" },
    { key: "experience", label: "Experience" },
    { key: "expertise", label: "Expertise" },
    { key: "skills", label: "Skills" },
    { key: "portfolio", label: "Portfolio" },
    { key: "achievements", label: "Achievements" },
    { key: "declaration", label: "Declaration" },
  ],
};

// An engineer's signature is what passes a milestone inspection and releases an
// escrow tranche, so their wizard leads with the credentials that make a
// signature mean something: IEB membership, the degree behind it, and the seal.
const ENGINEER: RoleWizard = {
  eyebrow: "Structural Engineer Verification",
  intro:
    "Submit your IEB membership, degree and professional seal for review. Verified engineers " +
    "can be appointed on projects and sign the milestone inspections that release escrow.",
  verifiedLabel: "Verified Structural Engineer",
  steps: [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "professional", label: "Practice" },
    { key: "engineerLicense", label: "IEB & Seal" },
    { key: "education", label: "Education" },
    { key: "experience", label: "Experience" },
    { key: "expertise", label: "Expertise" },
    { key: "skills", label: "Software" },
    { key: "portfolio", label: "Projects" },
    { key: "achievements", label: "Achievements" },
    { key: "declaration", label: "Declaration" },
  ],
};

// A contractor is verified as a business, not as a person with a degree: the
// trade licence and TIN are what a payout can legally be made against, and the
// enlistment class and plant are what an owner weighs when awarding a tender.
const CONTRACTOR: RoleWizard = {
  eyebrow: "Contractor Verification",
  intro:
    "Submit your firm's trade licence, tax registration and completed builds for review. " +
    "Only verified contractors can bid on tenders and receive escrow payouts.",
  verifiedLabel: "Verified Contractor",
  steps: [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "professional", label: "Firm" },
    { key: "business", label: "Registration" },
    { key: "capacity", label: "Capacity" },
    { key: "expertise", label: "Work packages" },
    { key: "skills", label: "Tools" },
    { key: "portfolio", label: "Completed builds" },
    { key: "achievements", label: "Achievements" },
    { key: "declaration", label: "Declaration" },
  ],
};

// A supplier's verification is about what they can actually deliver and from
// where — so the catalogue and coverage steps carry the weight that a
// portfolio does for the design professions.
const SUPPLIER: RoleWizard = {
  eyebrow: "Material Supplier Verification",
  intro:
    "Submit your trade licence, tax registration and the material lines you stock. Verified " +
    "suppliers are listed in the marketplace and can take orders from land owners.",
  verifiedLabel: "Verified Supplier",
  steps: [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "professional", label: "Business" },
    { key: "business", label: "Registration" },
    { key: "catalogue", label: "Catalogue" },
    { key: "coverage", label: "Coverage" },
    { key: "portfolio", label: "Notable supplies" },
    { key: "achievements", label: "Achievements" },
    { key: "declaration", label: "Declaration" },
  ],
};

// A land owner holds no licence and answers to no professional body, so there
// is no credential step to give them — their verification is an identity check
// and nothing more. It's the shortest wizard on the platform by design: what
// the platform needs to know is that they are a real, contactable adult whose
// NID nobody else is using, because that is what an architect relies on when
// they take a brief and what escrow relies on when it holds their money.
const LAND_OWNER: RoleWizard = {
  eyebrow: "Land Owner Verification",
  intro:
    "Confirm your identity so professionals know who they're working for. Verified land owners " +
    "can post briefs, hire architects and engineers, run tenders and fund escrow. " +
    "You can order from the marketplace either way.",
  verifiedLabel: "Verified Land Owner",
  steps: [
    { key: "identity", label: "Identity" },
    { key: "address", label: "Address" },
    { key: "declaration", label: "Declaration" },
  ],
};

/**
 * The verification wizard for a role, or undefined for roles that have nothing
 * to verify (ADMIN).
 *
 * Architect used to be the `default:` branch, which meant any role without a
 * case of its own was handed an architect's IAB-membership wizard. That was
 * harmless while the only such role was ADMIN, who never opens the page — and
 * it is exactly the kind of silent fallback that stops being harmless the
 * moment a role is added. Returning undefined makes callers say what they do.
 */
export function wizardFor(role: UserRole): RoleWizard | undefined {
  switch (role) {
    case UserRole.LAND_OWNER:
      return LAND_OWNER;
    case UserRole.ARCHITECT:
      return ARCHITECT;
    case UserRole.STRUCTURAL_ENGINEER:
      return ENGINEER;
    case UserRole.CONTRACTOR:
      return CONTRACTOR;
    case UserRole.SUPPLIER:
      return SUPPLIER;
    default:
      return undefined;
  }
}

/**
 * Headings for the steps several professions share.
 *
 * "Education" means an architecture degree to one role and a BSc in civil
 * engineering to another, and a contractor's "portfolio" is a list of finished
 * builds rather than designs. Rather than a role switch inside each of those
 * components, all the wording that varies lives in this one table.
 *
 * Steps that only one profession ever sees (the licence steps, capacity,
 * catalogue, coverage) keep their own copy in their own file.
 */
export function stepCopy(key: StepKey, role: UserRole): { title: string; subtitle: string } {
  const engineer = role === UserRole.STRUCTURAL_ENGINEER;
  const contractor = role === UserRole.CONTRACTOR;
  const supplier = role === UserRole.SUPPLIER;
  const owner = role === UserRole.LAND_OWNER;

  switch (key) {
    case "identity":
      return {
        title: "Identity",
        subtitle: owner
          ? "Your NID and a photo of yourself. This is the whole of a land owner's verification, so it's checked carefully."
          : "Your NID and a photo of yourself, checked against the card you upload.",
      };

    case "professional":
      if (contractor) {
        return {
          title: "Firm Information",
          subtitle: "Your construction firm, how it trades, where it works, and who it is.",
        };
      }
      if (supplier) {
        return {
          title: "Business Information",
          subtitle: "Your supply business, how it trades and where it operates from.",
        };
      }
      return {
        title: "Professional Information",
        subtitle: "How you practise, your title, firm, and professional presence.",
      };

    case "education":
      return {
        title: "Education",
        subtitle: engineer
          ? "Your engineering degrees, at least one with its certificate is required."
          : "Your architecture degrees, at least one with its certificate is required.",
      };

    case "experience":
      return {
        title: "Work Experience",
        subtitle: engineer
          ? "Where you've practised. Required, a supervisor checks it against your IEB grade."
          : "Firms you've worked with and the roles you held.",
      };

    case "expertise":
      if (contractor) {
        return {
          title: "Work Packages",
          subtitle: "The packages your firm takes on directly, rather than sub-contracts out.",
        };
      }
      return {
        title: engineer ? "Structural Expertise" : "Areas of Expertise",
        subtitle: engineer
          ? "The structural work you take on, pick only what you've actually designed."
          : "Pick every building type you have real project experience with.",
      };

    case "skills":
      if (contractor) {
        return {
          title: "Tools & Systems",
          subtitle: "How your office plans, measures and controls quality on a site.",
        };
      }
      return {
        title: engineer ? "Analysis Software" : "Technical Skills",
        subtitle: engineer
          ? "The analysis and design packages you model in, and how well."
          : "The design and engineering tools you work with, and how well.",
      };

    case "portfolio":
      if (contractor) {
        return {
          title: "Completed Builds",
          subtitle:
            "Projects your firm has finished, with photos, this is what land owners compare when awarding a tender.",
        };
      }
      if (supplier) {
        return {
          title: "Notable Supplies",
          subtitle:
            "Projects you've supplied materials to, with photos. Optional, but it builds trust.",
        };
      }
      return {
        title: engineer ? "Projects" : "Portfolio",
        subtitle: engineer
          ? "Structures you've designed or checked, the first photo of each becomes its cover."
          : "Your best built work, the first photo of each project becomes its cover.",
      };

    case "achievements":
      return {
        title: "Achievements",
        subtitle:
          contractor || supplier
            ? "Awards, certifications, and milestones your business has earned."
            : "Awards, competitions, research, publications, seminars, and professional memberships.",
      };

    default:
      return { title: "", subtitle: "" };
  }
}

/**
 * Whether a step's key fields are filled, which is what ticks it gold in the
 * sidebar. Deliberately looser than computeCompletion's mandatory list: this is
 * a "you've done this bit" signal while typing, not the gate on submitting.
 */
export function isStepComplete(key: StepKey, form: WizardForm, role: UserRole): boolean {
  switch (key) {
    case "identity":
      return !!(
        form.avatarUrl &&
        form.name &&
        form.nid &&
        form.dateOfBirth &&
        form.nidFrontUrl &&
        form.nidBackUrl
      );
    case "address":
      // Only the permanent trio counts — that's the one the NID checks compare
      // against and the one computeCompletion makes mandatory.
      return !!(
        form.permanentAddress &&
        form.permanentDivision &&
        form.permanentDistrict &&
        form.permanentPostcode
      );
    case "professional":
      // Independents have no firm to name, so the firm only counts when they
      // aren't independent. Contractors and suppliers are always a business.
      return role === UserRole.CONTRACTOR || role === UserRole.SUPPLIER
        ? !!(form.company && form.bio)
        : !!(form.bio && (form.isIndependent || form.company));
    case "license":
      return !!(form.licenseNumber && form.iabCertificateUrl);
    case "engineerLicense":
      return !!(form.licenseNumber && form.licenseCertificateUrl && form.professionalSealUrl);
    case "business":
      return !!(form.tradeLicenseNo && form.tradeLicenseUrl && form.tinNumber);
    case "capacity":
      return !!(form.enlistmentBody && form.contractorClass) || form.equipment.length > 0;
    case "catalogue":
      return form.supplyCategories.length > 0;
    case "coverage":
      return !!form.warehouseAddress;
    case "education":
      return form.education.some((e) => e.degree && e.institution && e.certificateUrl);
    case "experience":
      return form.experience.length > 0;
    case "expertise":
      return form.expertise.length > 0;
    case "skills":
      return form.skills.length > 0;
    case "portfolio":
      return form.portfolio.some((p) => p.title && p.imageUrls.length > 0);
    case "achievements":
      return form.achievements.length > 0;
    case "declaration":
      return !!(
        form.agreeTruth &&
        form.agreeBodyCheck &&
        form.agreeSuspension &&
        form.declarationSignature
      );
  }
}
