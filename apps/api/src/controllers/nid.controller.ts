import type { Request, Response } from "express";
import {
  checkNidAge,
  checkNidFormat,
  isDummyNid,
  nidKeyFor,
  nidMatchesDateOfBirth,
  normalizeNid,
  postcodeFitsDistrict,
  type LandOwnerProfile,
  type NidBackResult,
  type NidCheck,
  type NidImageCheck,
  type NidOcrResult,
  type ProfessionalProfile,
} from "@buildora/shared";
import { User } from "../models/User";
import { nidLookupKey, openProfile, sealProfile } from "../services/profileCrypto";
import { inspectNidImage } from "../services/nidImage";
import { readNidCard, readNidCardBack } from "../services/nidOcr";

/**
 * The automated NID pre-screen, run for every role — land owners and
 * professionals alike.
 *
 * The passes, cheapest first:
 *   1. Format     — is it a real 10/13/17-digit shape?
 *   2. Invented   — is it 1111111111, a counting run, or 1212 repeated?
 *   3. Age        — is the holder old enough to have been issued one?
 *   4. Birth year — a 17-digit NID encodes it; does it match the profile's DOB?
 *   5. Duplicate  — is another account already using this identity?
 *   6. Postcode   — does it belong to the district they registered in?
 *   7. Images     — are the uploads card-shaped, readable, un-retouched?
 *   8. OCR        — do the photographed front and back actually say this?
 *
 * Which of these refuse a submission and which are only shown to a supervisor
 * is decided in one place, `gradeNidCheck` in the shared package — not here.
 * This function's job is to gather evidence, not to judge it.
 *
 * None of it is government verification. The Election Commission's Porichoy
 * gateway is the only thing that could be, and it is fee-based and issued to
 * vetted companies — see services/nidOcr.ts.
 */

/** What the checks compare against — whatever the account has on file. */
export interface NidClaim {
  name: string;
  nid: string;
  dateOfBirth?: string;
  nidFrontUrl?: string;
  nidBackUrl?: string;
  permanentDistrict?: string;
  permanentPostcode?: string;
}

/**
 * Runs every pass and returns the record to store. A reader or a host being
 * unavailable is recorded as "couldn't look", never as a failure — that
 * distinction is the whole reason each result is three-state.
 */
export async function runNidCheck(userId: string, claimed: NidClaim): Promise<NidCheck> {
  const format = checkNidFormat(claimed.nid);
  const nid = format.normalized;

  // Two accounts on one identity is the one decisive signal here: an NID
  // belongs to exactly one citizen, so a second account holding it means at
  // least one of them is wrong. Compared on the canonical key rather than the
  // raw digits, so writing the same number as 13 digits on one account and 17
  // on another doesn't slip past.
  // Matched through the blind index: the stored numbers are encrypted, and two
  // copies of one NID never look alike, so an equality search on the ciphertext
  // would find nothing and quietly report every duplicate as clean.
  const lookupKey = nidLookupKey(nid);
  const duplicate = lookupKey
    ? (await User.exists({ _id: { $ne: userId }, "profile.nidKeyBlind": lookupKey })) !== null
    : false;

  const age = checkNidAge(claimed.dateOfBirth);

  // Cloudinary is cheap and rate-limited generously, so both images together.
  const [frontImage, backImage] = await Promise.all([
    inspectNidImage("front", claimed.nidFrontUrl, userId),
    inspectNidImage("back", claimed.nidBackUrl, userId),
  ]);
  const images = [frontImage, backImage].filter((i): i is NidImageCheck => i !== undefined);

  // The two Gemini calls run one after the other rather than together: they
  // share one free-tier per-minute quota, and a burst of two is what tips a
  // busy moment into a 429 that costs the user their check.
  let ocr: NidOcrResult | undefined;
  let back: NidBackResult | undefined;

  if (format.ok && claimed.nidFrontUrl) {
    try {
      ocr = await readNidCard(claimed.nidFrontUrl, { ...claimed, nid });
    } catch (err) {
      console.error("[nid] front OCR unavailable:", err);
      ocr = {
        readable: false,
        note: err instanceof Error ? err.message : "The card couldn't be read",
      };
    }
  }

  if (format.ok && claimed.nidBackUrl) {
    try {
      back = await readNidCardBack(claimed.nidBackUrl, {
        permanentDistrict: claimed.permanentDistrict,
      });
    } catch (err) {
      console.error("[nid] back OCR unavailable:", err);
      back = {
        readable: false,
        note: err instanceof Error ? err.message : "The back of the card couldn't be read",
      };
    }
  }

  const dobMatches = nidMatchesDateOfBirth(nid, claimed.dateOfBirth);
  const postcodeMatches = postcodeFitsDistrict(
    claimed.permanentPostcode,
    claimed.permanentDistrict
  );

  return {
    nid,
    format: format.format,
    formatOk: format.ok,
    formatIssue: format.issue,
    dummy: isDummyNid(nid),
    ageOk: age.ok,
    age: age.age,
    ageIssue: age.issue,
    dobMatches: dobMatches ?? null,
    postcodeMatches: postcodeMatches ?? null,
    duplicate,
    ocr,
    back,
    images: images.length > 0 ? images : undefined,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Gathers everything the checks compare against out of a stored profile.
 *
 * Shared by the on-demand endpoint below and by the verification submit
 * handler, so the check a user runs from the wizard and the authoritative one
 * the server runs at submit time are looking at exactly the same inputs.
 */
export function claimFromProfile(
  name: string,
  profile: ProfessionalProfile & LandOwnerProfile
): NidClaim {
  return {
    name,
    nid: profile.nid ?? "",
    dateOfBirth: profile.dateOfBirth,
    nidFrontUrl: profile.nidFrontUrl,
    nidBackUrl: profile.nidBackUrl,
    permanentDistrict: profile.permanentDistrict,
    permanentPostcode: profile.permanentPostcode,
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

  // Decrypt before the checks: every pass below compares the real number, the
  // real date of birth and the previous check against each other.
  const userId = user._id.toString();
  const profile = (openProfile(user.toObject().profile, userId) ?? {}) as ProfessionalProfile &
    LandOwnerProfile;
  if (!profile.nid) {
    return res.status(400).json({
      error: { message: "Add your NID number to your profile first" },
    });
  }

  const check = await runNidCheck(userId, claimFromProfile(user.name, profile));

  // A duplicate is refused here rather than recorded and passed on: the unique
  // index would reject the save anyway, and a plain 409 explains it far better
  // than a driver error would.
  if (check.duplicate) {
    return res.status(409).json({
      error: {
        code: "NID_ALREADY_REGISTERED",
        message:
          "Another Buildora account is already registered with this NID. An NID can only be " +
          "used once — check the number, or contact support if you think this is a mistake.",
      },
    });
  }

  // Store the normalised number alongside the result, then seal the whole
  // profile — sealProfile derives the blind index from `nid`, so the lookup key
  // and the number it guards can never drift apart.
  profile.nid = check.nid || profile.nid;
  profile.nidCheck = check;
  user.profile = sealProfile(profile, userId);
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
  const district = String(req.query.permanentDistrict ?? "") || undefined;
  const postcode = String(req.query.permanentPostcode ?? "") || undefined;
  const age = checkNidAge(dob);

  return res.json({
    data: {
      formatOk: format.ok,
      format: format.format,
      issue: format.issue,
      birthYear: format.birthYear,
      dummy: isDummyNid(raw),
      ageOk: age.ok,
      age: age.age,
      ageIssue: age.issue,
      dobMatches: nidMatchesDateOfBirth(raw, dob) ?? null,
      postcodeMatches: postcodeFitsDistrict(postcode, district) ?? null,
    },
  });
}
