import { UserRole } from "@buildora/shared";

/**
 * The text and route segment that vary between the three searchable
 * professions. Everything else about the directory and profile pages is
 * identical, so this is the one table a new role needs a row in — the same
 * pattern `roles.ts` uses for the verification wizard.
 */
export interface ProfessionalRoleCopy {
  /** URL segment: /architects, /engineers, /contractors. */
  basePath: string;
  singular: string;
  plural: string;
  /** Eyebrow above the directory heading, e.g. "Find an architect". */
  kicker: string;
  verifiedBody: string;
  unverifiedBody: string;
  /** The "Contact" section on the profile page — a two-line headline. */
  contactHeadingLines: [string, string];
  /** "Tell {firstName} about ..." — {firstName} is replaced by the caller. */
  contactBody: string;
  contactCta: string;
}

const COPY: Partial<Record<UserRole, ProfessionalRoleCopy>> = {
  [UserRole.ARCHITECT]: {
    basePath: "architects",
    singular: "architect",
    plural: "architects",
    kicker: "Find an architect",
    verifiedBody:
      "Every architect here has had their IAB membership, degree and identity checked by a Buildora supervisor.",
    unverifiedBody:
      "Including architects a supervisor hasn't approved yet. You can view their work, but you can't contact them until they're verified.",
    contactHeadingLines: ["Let's Create Something", "Meaningful Together"],
    contactBody:
      "Tell {firstName} about your project, location, plot size, building type, and timeline.",
    contactCta: "Start a Project",
  },
  [UserRole.STRUCTURAL_ENGINEER]: {
    basePath: "engineers",
    singular: "engineer",
    plural: "engineers",
    kicker: "Find a structural engineer",
    verifiedBody:
      "Every engineer here has had their IEB membership, degree and identity checked by a Buildora supervisor.",
    unverifiedBody:
      "Including engineers a supervisor hasn't approved yet. You can view their work, but you can't contact them until they're verified.",
    contactHeadingLines: ["Let's Talk Through", "Your Structural Plan"],
    contactBody: "Tell {firstName} about your structure, location, plot size, and timeline.",
    contactCta: "Send Request",
  },
  [UserRole.CONTRACTOR]: {
    basePath: "contractors",
    singular: "contractor",
    plural: "contractors",
    kicker: "Find a contractor",
    verifiedBody:
      "Every contractor here has had their trade licence, tax registration and identity checked by a Buildora supervisor.",
    unverifiedBody:
      "Including contractors a supervisor hasn't approved yet. You can view their work, but you can't contact them until they're verified.",
    contactHeadingLines: ["Let's Discuss", "Your Build"],
    contactBody: "Tell {firstName} about your build, location, budget range, and timeline.",
    contactCta: "Send Request",
  },
};

export function professionalCopy(role: UserRole): ProfessionalRoleCopy {
  return COPY[role] ?? COPY[UserRole.ARCHITECT]!;
}
