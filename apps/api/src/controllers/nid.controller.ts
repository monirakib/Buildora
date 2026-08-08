import type { Request, Response } from "express";
import {
  checkNidFormat,
  nidMatchesDateOfBirth,
  normalizeNid,
  type LandOwnerProfile,
  type NidCheck,
  type NidOcrResult,
  type ProfessionalProfile,
} from "@buildora/shared";
import { User } from "../models/User";
import { readNidCard } from "../services/nidOcr";

/**
 * The automated NID pre-screen, run for every role — land owners and
 * professionals alike.
 *
 * Four passes, cheapest first:
 *   1. Format     — is it a real 10/13/17-digit shape?
 *   2. Birth year — a 17-digit NID encodes it; does it match the profile's DOB?
 *   3. Duplicate  — is another account already using this number?
 *   4. OCR        — does the photographed card actually say this?
 *
 * Only the duplicate is treated as decisive; the rest are flags a supervisor
 * weighs. This never becomes "government verified" — see services/nidOcr.ts.
 */

/** Runs every pass and returns the record to store. OCR failure is not a fail. */
export async function runNidCheck(
  userId: string,
  claimed: { name: string; nid: string; dateOfBirth?: string; nidFrontUrl?: string }
): Promise<NidCheck> {
  const format = checkNidFormat(claimed.nid);
  const nid = format.normalized;

  // A number already on another account is the one hard signal here: NIDs are
  // unique per citizen, so two accounts sharing one means at least one is wrong.
  const duplicate = nid
    ? (await User.exists({ _id: { $ne: userId }, "profile.nid": nid })) !== null
    : false;

  let ocr: NidOcrResult | undefined;
  if (format.ok && claimed.nidFrontUrl) {
    try {
      ocr = await readNidCard(claimed.nidFrontUrl, { ...claimed, nid });
    } catch (err) {
      // Reader unavailable — record that we couldn't look, not that it failed.
      console.error("[nid] OCR unavailable:", err);
      ocr = {
        readable: false,
        note: err instanceof Error ? err.message : "The card couldn't be read",
      };
    }
  }

  const dobMatches = nidMatchesDateOfBirth(nid, claimed.dateOfBirth);

  return {
    nid,
    format: format.format,
    formatOk: format.ok,
    formatIssue: format.issue,
    dobMatches: dobMatches ?? null,
    duplicate,
    ocr,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * POST /api/nid/check — runs the pre-screen against the caller's own profile
 * and stores the result.
 *
 * Deliberately takes no body: it reads the NID, date of birth and card image
 * already saved on the account, so the browser can't submit one set of details
 * to be checked and a different set to be stored.
 */
export async function checkMyNid(req: Request, res: Response) {
  const user = await User.findById(req.auth!.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  const profile = (user.profile ?? {}) as ProfessionalProfile & LandOwnerProfile;
  if (!profile.nid) {
    return res.status(400).json({
      error: { message: "Add your NID number to your profile first" },
    });
  }

  const check = await runNidCheck(user._id.toString(), {
    name: user.name,
    nid: profile.nid,
    dateOfBirth: profile.dateOfBirth,
    nidFrontUrl: profile.nidFrontUrl,
  });

  // Store the normalised number alongside the result, so the duplicate check
  // compares like with like on the next run.
  profile.nid = check.nid || profile.nid;
  profile.nidCheck = check;
  user.markModified("profile");
  await user.save();

  return res.json({ data: { check } });
}

/**
 * GET /api/nid/preview?nid=…&dateOfBirth=… — the cheap offline checks only, for
 * live feedback while someone is still typing. Touches no images and stores
 * nothing.
 */
export function previewNid(req: Request, res: Response) {
  const raw = normalizeNid(String(req.query.nid ?? ""));
  const format = checkNidFormat(raw);
  const dob = String(req.query.dateOfBirth ?? "") || undefined;

  return res.json({
    data: {
      formatOk: format.ok,
      format: format.format,
      issue: format.issue,
      birthYear: format.birthYear,
      dobMatches: nidMatchesDateOfBirth(raw, dob) ?? null,
    },
  });
}
