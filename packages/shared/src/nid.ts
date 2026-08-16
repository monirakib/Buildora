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

import type { NidCheck } from "./types";

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

/** Nobody is issued an NID before their 18th birthday. */
export const MIN_NID_AGE = 18;

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

// ---------------------------------------------------------------------------
// Made-up numbers
// ---------------------------------------------------------------------------

/**
 * The longest run of digits that each step up or down by one, counting 9→0 and
 * 0→9 as a step so "7890" reads as the ascending run it obviously is.
 */
function longestStepRun(nid: string): number {
  let longest = 1;
  let current = 1;

  for (let i = 1; i < nid.length; i += 1) {
    const previous = Number(nid[i - 1]);
    const digit = Number(nid[i]);
    // (digit - previous + 10) % 10 turns a step into 1 (up) or 9 (down)
    // regardless of the wrap, which is what makes 9→0 and 0→9 count.
    const step = (digit - previous + 10) % 10;
    current = step === 1 || step === 9 ? current + 1 : 1;
    if (current > longest) longest = current;
  }

  return longest;
}

/** True when the whole number is one short block written over and over. */
function isRepeatedBlock(nid: string): boolean {
  for (let size = 1; size <= nid.length / 2; size += 1) {
    if (nid.length % size !== 0) continue;
    const block = nid.slice(0, size);
    if (nid.match(new RegExp(`^(?:${block})+$`))) return true;
  }
  return false;
}

/**
 * Whether a number is obviously invented rather than issued: 1111111111,
 * 1234567890, 1212121212 and the rest of what people type when they're testing
 * a form or don't want to give their real number.
 *
 * The run threshold is deliberately high. Eight digits stepping in the same
 * direction happens in a genuine NID about once in ten million, while every
 * made-up "sequential" number people actually type runs far longer than that —
 * so this catches the fakes without ever accusing a real card.
 */
export function isDummyNid(raw: string): boolean {
  const nid = normalizeNid(raw);
  if (!/^\d+$/.test(nid) || nid.length < 4) return false;
  return isRepeatedBlock(nid) || longestStepRun(nid) >= 8;
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

export interface NidAgeResult {
  ok: boolean;
  /** Completed years, absent when the date couldn't be read. */
  age?: number;
  issue?: string;
}

/**
 * Whether the holder is old enough to have been issued an NID at all.
 *
 * Age is counted in whole calendar years — the difference in years, minus one
 * if this year's birthday hasn't come round yet. Dividing elapsed days by 365
 * (the obvious shortcut) drifts by a day per leap year and would call someone
 * 18 up to five days early.
 */
export function checkNidAge(dateOfBirth: string | undefined, now = new Date()): NidAgeResult {
  const value = (dateOfBirth ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, issue: "Enter your date of birth as it appears on the card" };
  }

  // Parsed as UTC midday so a timezone offset can never roll the date over.
  const dob = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) {
    return { ok: false, issue: "That isn't a real date" };
  }
  if (dob.getTime() > now.getTime()) {
    return { ok: false, issue: "That date of birth is in the future" };
  }
  if (dob.getUTCFullYear() < MIN_BIRTH_YEAR) {
    return { ok: false, issue: `A date of birth before ${MIN_BIRTH_YEAR} isn't plausible` };
  }

  const birthdayPassed =
    now.getMonth() > dob.getUTCMonth() ||
    (now.getMonth() === dob.getUTCMonth() && now.getDate() >= dob.getUTCDate());
  const age = now.getFullYear() - dob.getUTCFullYear() - (birthdayPassed ? 0 : 1);

  if (age < MIN_NID_AGE) {
    return {
      ok: false,
      age,
      issue: `An NID is only issued from age ${MIN_NID_AGE} — this date of birth makes the holder ${age}`,
    };
  }

  return { ok: true, age };
}

// ---------------------------------------------------------------------------
// Canonical form
// ---------------------------------------------------------------------------

/**
 * The value two accounts are compared on to decide they belong to one person.
 *
 * A 17-digit NID is the 13-digit one with the birth year in front, so the same
 * citizen can write their number two ways and — comparing the raw strings —
 * hold two accounts on one identity. Reducing both to the 13-digit tail closes
 * that.
 *
 * A 10-digit Smart NID can't be reduced to its owner's legacy 13: the mapping
 * lives only at the Election Commission. So one person holding both a Smart
 * card account and a legacy card account is still possible, and no offline
 * check can catch it. Say so out loud rather than implying the rule is airtight.
 */
export function nidKeyFor(raw: string): string | undefined {
  const result = checkNidFormat(raw);
  if (!result.ok) return undefined;
  return result.format === "LEGACY_17" ? result.normalized.slice(4) : result.normalized;
}

/**
 * The 13→17 conversion: the birth year written in front of a legacy number.
 * Returns undefined when there's no 13-digit number or no usable birth year.
 */
export function expandNid13(raw: string, dateOfBirth: string | undefined): string | undefined {
  const result = checkNidFormat(raw);
  if (!result.ok || result.format !== "LEGACY_13") return undefined;

  const year = Number((dateOfBirth ?? "").slice(0, 4));
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR) return undefined;

  return `${year}${result.normalized}`;
}

/**
 * The administrative codes a legacy number carries, split out for a supervisor
 * to read. Works on a 13-digit number and on the 13-digit tail of a 17.
 *
 * Deliberately no district *name*: the codes are real, but two mutually
 * contradictory "district code" tables circulate publicly (a 01–64 geographic
 * serial, and an alphabetical one where Dhaka is 26), and no Election
 * Commission publication settles it. Naming the district from the wrong table
 * would accuse honest applicants of living somewhere they don't. The codes are
 * shown as digits; a human recognises their own.
 */
export interface Nid13Parts {
  /** Digits 1–2. */
  districtCode: string;
  /** Digit 3 — rural / municipality / city corporation and so on. */
  rmoCode: string;
  /** Digits 4–5. */
  upazilaCode: string;
  /** Digits 6–7 — union in a rural area, ward in a city. */
  unionWardCode: string;
  /** Digits 8–13 — the serial from the registration form. */
  serial: string;
}

export function parseNid13(raw: string): Nid13Parts | undefined {
  const result = checkNidFormat(raw);
  if (!result.ok || result.format === "SMART_10") return undefined;

  const digits = result.format === "LEGACY_17" ? result.normalized.slice(4) : result.normalized;
  return {
    districtCode: digits.slice(0, 2),
    rmoCode: digits.slice(2, 3),
    upazilaCode: digits.slice(3, 5),
    unionWardCode: digits.slice(5, 7),
    serial: digits.slice(7),
  };
}

// ---------------------------------------------------------------------------
// Reading the whole result
// ---------------------------------------------------------------------------

export type NidSeverity = "PASS" | "REVIEW" | "FAIL";

export interface NidGrade {
  severity: NidSeverity;
  /** Reasons the submission is refused. Empty unless severity is FAIL. */
  blockers: string[];
  /** Reasons the supervisor should look closely. Never refuse on these. */
  flags: string[];
}

/**
 * Turns a stored NidCheck into a decision, so the wizard, the submit endpoint
 * and the supervisor's console all read the same result the same way.
 *
 * The split is the point. **Blockers** are things that cannot be true of a real
 * applicant giving their own number: a number that isn't NID-shaped, one nobody
 * was issued, a holder too young to have a card, a birth year that contradicts
 * itself, a number already registered to somebody else, or a card that visibly
 * says a different number than the one typed. **Flags** are everything a
 * careless-but-honest person trips: a photo at the wrong crop, a postcode from
 * the district they moved away from, a card the reader couldn't make out.
 *
 * Flags never refuse a submission. The supervisor is the gate — that's the same
 * rule the IAB and credential pre-screens already follow, and it exists because
 * a false accusation costs a real user their account while a false pass only
 * costs a supervisor a second look, which they were going to give anyway.
 */
export function gradeNidCheck(check: NidCheck | undefined): NidGrade {
  const blockers: string[] = [];
  const flags: string[] = [];

  if (!check) {
    return { severity: "FAIL", blockers: ["The NID check hasn't been run yet"], flags };
  }

  if (!check.formatOk) {
    blockers.push(check.formatIssue ?? "That isn't a valid NID number");
  }
  if (check.dummy) {
    blockers.push("That number is a repeated or counting pattern, not an issued NID");
  }
  if (check.ageOk === false) {
    blockers.push(check.ageIssue ?? `An NID is only issued from age ${MIN_NID_AGE}`);
  }
  if (check.dobMatches === false) {
    blockers.push("The birth year inside the NID doesn't match the date of birth given");
  }
  if (check.duplicate) {
    blockers.push("Another account is already registered with this NID");
  }
  if (check.ocr?.nidMatches === false) {
    blockers.push(`The card reads ${check.ocr.nid ?? "a different number"}, not the number typed`);
  }

  if (check.postcodeMatches === false) {
    flags.push("The postcode isn't in the district given as the permanent address");
  }
  if (check.ocr) {
    if (!check.ocr.readable) {
      flags.push(check.ocr.note ?? "The front of the card couldn't be read");
    }
    if (check.ocr.nameMatches === false) {
      flags.push(`The card is printed in the name "${check.ocr.name ?? "someone else"}"`);
    }
    if (check.ocr.dobMatches === false) {
      flags.push("The date of birth printed on the card differs from the one given");
    }
    if (check.ocr.side && check.ocr.side !== "FRONT") {
      flags.push("The image uploaded as the front doesn't look like the front of a card");
    }
    if (typeof check.ocr.faceCount === "number" && check.ocr.faceCount !== 1) {
      flags.push(
        check.ocr.faceCount === 0
          ? "No portrait photo is visible on the card"
          : `${check.ocr.faceCount} faces are visible where a card has one`
      );
    }
  }
  if (check.back) {
    if (!check.back.readable) {
      flags.push(check.back.note ?? "The back of the card couldn't be read");
    }
    if (check.back.districtMatches === false) {
      flags.push("The address on the back of the card names a different district");
    }
  }
  for (const image of check.images ?? []) {
    if (image.note) flags.push(`${image.side} image: ${image.note}`);
    if (image.aspectOk === false) {
      flags.push(`The ${image.side} image isn't the shape of a card (${image.aspectRatio})`);
    }
    if (image.resolutionOk === false) {
      flags.push(`The ${image.side} image is too small to read reliably`);
    }
    if (image.editorSoftware) {
      flags.push(`The ${image.side} image was saved by ${image.editorSoftware}`);
    }
  }

  return {
    severity: blockers.length > 0 ? "FAIL" : flags.length > 0 ? "REVIEW" : "PASS",
    blockers,
    flags,
  };
}
