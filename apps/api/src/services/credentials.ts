import {
  UserRole,
  checkBin,
  checkIebMembershipNo,
  checkTin,
  checkTradeLicenseNo,
  isExpired,
  type CredentialCheck,
  type CredentialCheckItem,
  type CredentialFormatResult,
  type ProfessionalProfile,
} from "@buildora/shared";
import { User } from "../models/User";

/**
 * The automated pre-screen for the credentials architects don't have: an
 * engineer's IEB membership number, and a contractor's or supplier's trade
 * licence, BIN and TIN.
 *
 * This is the same kind of thing as the NID pre-screen, and carries the same
 * warning. There is no free register to check any of these against — NBR
 * publishes no BIN or TIN lookup, IEB publishes no member directory, and trade
 * licences are issued by hundreds of separate city corporations and pourashavas
 * that share no register. So all three passes here are structural:
 *
 *   1. Format    — is it the right shape for that kind of number?
 *   2. Expiry    — has an attached expiry date already passed?
 *   3. Duplicate — is another account already claiming this exact number?
 *
 * None of it verifies anything. It narrows what the supervisor has to check by
 * hand and flags the two things a human reading a scanned document would most
 * easily miss. Never label the result "verified".
 */

/** One number to screen: what it is, its value, its rule, and its expiry. */
interface Candidate {
  label: string;
  raw: string | undefined;
  check: (raw: string) => CredentialFormatResult;
  /** Dotted path of the profile field, for the duplicate query. */
  path: string;
  /** ISO expiry date, when the credential has one. */
  expiry?: string;
}

/**
 * Which numbers each role is screened on. A number the professional left blank
 * is skipped entirely — the mandatory checklist in computeCompletion is what
 * decides whether it was allowed to be blank, not this.
 */
function candidatesFor(role: UserRole, p: ProfessionalProfile): Candidate[] {
  const business: Candidate[] = [
    {
      label: "Trade licence number",
      raw: p.tradeLicenseNo,
      check: checkTradeLicenseNo,
      path: "profile.tradeLicenseNo",
      expiry: p.tradeLicenseExpiry,
    },
    {
      label: "BIN (VAT registration)",
      raw: p.binNumber,
      check: checkBin,
      path: "profile.binNumber",
    },
    { label: "TIN", raw: p.tinNumber, check: checkTin, path: "profile.tinNumber" },
  ];

  switch (role) {
    case UserRole.STRUCTURAL_ENGINEER:
      return [
        {
          label: "IEB membership number",
          raw: p.licenseNumber,
          check: checkIebMembershipNo,
          path: "profile.licenseNumber",
          expiry: p.licenseExpiryDate,
        },
      ];
    case UserRole.CONTRACTOR:
    case UserRole.SUPPLIER:
      return business;
    // Architects are screened against the live IAB directory instead, which is
    // a real lookup rather than a shape check — see services/iab.ts.
    default:
      return [];
  }
}

/**
 * Runs every applicable check for one professional and returns the record to
 * store on their profile. Returns undefined when the role has nothing to screen
 * (architects) or the professional filled none of the numbers in — an empty
 * record would read as "checked and found nothing wrong", which is a lie.
 */
export async function screenCredentials(
  userId: string,
  role: UserRole,
  profile: ProfessionalProfile
): Promise<CredentialCheck | undefined> {
  const candidates = candidatesFor(role, profile).filter((c) => (c.raw ?? "").trim() !== "");
  if (candidates.length === 0) return undefined;

  const items: CredentialCheckItem[] = await Promise.all(
    candidates.map(async (c): Promise<CredentialCheckItem> => {
      const format = c.check(c.raw!);
      // Compare against the normalised value, since that's what gets stored —
      // two accounts writing the same licence differently should still collide.
      const duplicate =
        format.normalized !== "" &&
        (await User.exists({ _id: { $ne: userId }, [c.path]: format.normalized })) !== null;

      return {
        label: c.label,
        value: format.normalized,
        formatOk: format.ok,
        issue: format.issue,
        duplicate,
        expired: isExpired(c.expiry) ?? null,
      };
    })
  );

  return { items, checkedAt: new Date().toISOString() };
}

/**
 * Rewrites the profile's credential numbers to their normalised form, so the
 * next duplicate check compares like with like (the NID pre-screen does the
 * same with `profile.nid`). Mutates the profile it's given.
 */
export function normalizeCredentials(role: UserRole, profile: ProfessionalProfile): void {
  if (role === UserRole.STRUCTURAL_ENGINEER) {
    if (profile.licenseNumber) {
      const r = checkIebMembershipNo(profile.licenseNumber);
      if (r.normalized) profile.licenseNumber = r.normalized;
    }
    return;
  }
  if (role !== UserRole.CONTRACTOR && role !== UserRole.SUPPLIER) return;

  if (profile.tradeLicenseNo) {
    const r = checkTradeLicenseNo(profile.tradeLicenseNo);
    if (r.normalized) profile.tradeLicenseNo = r.normalized;
  }
  if (profile.binNumber) {
    const r = checkBin(profile.binNumber);
    if (r.normalized) profile.binNumber = r.normalized;
  }
  if (profile.tinNumber) {
    const r = checkTin(profile.tinNumber);
    if (r.normalized) profile.tinNumber = r.normalized;
  }
}
