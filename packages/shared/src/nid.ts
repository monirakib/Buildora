/**
 * Structural checks on a Bangladeshi National ID number.
 *
 * IMPORTANT: none of this proves the NID exists or belongs to the person. Only
 * the Election Commission can confirm that, through the Porichoy gateway, which
 * is fee-based and issued to vetted companies. Everything here is
 * pre-screening — it catches typos, mismatched documents and reused numbers so
 * a supervisor spends their time on the cases that need a human.
 *
 * Never label the result of these checks as government verification.
 *
 * The three formats in circulation:
 *   10 digits — Smart NID. Nothing is publicly derivable from it. (Its last
 *               digit is described as a checksum, but the algorithm isn't
 *               published, so we don't invent one — a wrong guess would reject
 *               real cards.)
 *   13 digits — district(2) + RMO(1) + upazila(2) + union/ward(2) + serial(6).
 *   17 digits — the same 13 with the four-digit birth year in front. This is
 *               the one that gives us a real cross-check.
 */

export type NidFormat = "SMART_10" | "LEGACY_13" | "LEGACY_17";

export interface NidFormatResult {
  /** True when the number is one of the three recognised shapes. */
  ok: boolean;
  /** Digits only, with spaces and dashes removed. */
  normalized: string;
  format?: NidFormat;
  /** Why it failed, ready to show in a form. */
  issue?: string;
  /** Birth year encoded in a 17-digit number; undefined for the other two. */
  birthYear?: number;
}

/** Strips the separators people type, leaving digits. */
export function normalizeNid(raw: string): string {
  return (raw ?? "").replace(/[\s-]/g, "");
}

/** The earliest birth year a living NID holder could plausibly have. */
const MIN_BIRTH_YEAR = 1900;

export function checkNidFormat(raw: string): NidFormatResult {
  const normalized = normalizeNid(raw);

  if (normalized === "") {
    return { ok: false, normalized, issue: "Enter your NID number" };
  }
  if (!/^\d+$/.test(normalized)) {
    return { ok: false, normalized, issue: "An NID number is digits only" };
  }

  const format: NidFormat | undefined =
    normalized.length === 10
      ? "SMART_10"
      : normalized.length === 13
        ? "LEGACY_13"
        : normalized.length === 17
          ? "LEGACY_17"
          : undefined;

  if (!format) {
    return {
      ok: false,
      normalized,
      issue: `A Bangladeshi NID is 10, 13 or 17 digits — this one has ${normalized.length}`,
    };
  }

  if (format !== "LEGACY_17") return { ok: true, normalized, format };

  // 17-digit numbers carry the birth year, so it has to be a real one.
  const birthYear = Number(normalized.slice(0, 4));
  const thisYear = new Date().getFullYear();
  if (birthYear < MIN_BIRTH_YEAR || birthYear > thisYear) {
    return {
      ok: false,
      normalized,
      format,
      issue: `A 17-digit NID starts with the birth year — "${normalized.slice(0, 4)}" isn't one`,
    };
  }

  return { ok: true, normalized, format, birthYear };
}

/**
 * Whether a 17-digit NID's built-in birth year agrees with the date of birth on
 * the profile.
 *
 * Returns undefined when there's nothing to compare — a 10- or 13-digit number,
 * or no date of birth on file — which is "not checked", not "failed".
 */
export function nidMatchesDateOfBirth(
  raw: string,
  dateOfBirth: string | undefined
): boolean | undefined {
  const result = checkNidFormat(raw);
  if (!result.ok || result.birthYear === undefined) return undefined;

  const year = Number((dateOfBirth ?? "").slice(0, 4));
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR) return undefined;

  return year === result.birthYear;
}
