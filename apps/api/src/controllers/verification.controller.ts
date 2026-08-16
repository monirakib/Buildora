import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  NotificationType,
  UserRole,
  VerificationStatus,
  computeCompletion,
  gradeNidCheck,
  normalizeMembershipNo,
  type LandOwnerProfile,
  type ProfessionalProfile,
  type VerificationRequest as VerificationRequestShape,
} from "@buildora/shared";
import { User, type UserDoc } from "../models/User";
import { VerificationRequest, type VerificationRequestDoc } from "../models/VerificationRequest";
import { claimFromProfile, runNidCheck } from "./nid.controller";
import { normalizeCredentials, screenCredentials } from "../services/credentials";
import { lookupIabMember } from "../services/iab";
import { openProfile, sealProfile } from "../services/profileCrypto";
import { notify, notifyMany } from "../services/notifications";

// The professional field is populated on every query in this file, so the
// document's ObjectId ref has been replaced by the actual user document.
type PopulatedRequest = Omit<HydratedDocument<VerificationRequestDoc>, "professional"> & {
  professional: HydratedDocument<UserDoc>;
};

/** API shape of a request — includes a small summary of the professional. */
function toVerificationRequest(doc: PopulatedRequest): VerificationRequestShape {
  const profile = (doc.professional.profile ?? {}) as ProfessionalProfile;
  return {
    id: doc._id.toString(),
    professional: {
      id: doc.professional._id.toString(),
      name: doc.professional.name,
      username: doc.professional.username,
      role: doc.professional.role,
      company: profile.company,
      avatarUrl: profile.avatarUrl,
    },
    status: doc.status,
    message: doc.message,
    note: doc.note,
    manualReview: doc.manualReview,
    createdAt: doc.createdAt.toISOString(),
    decidedAt: doc.decidedAt?.toISOString(),
  };
}

const iabSchema = z.object({
  membershipNo: z.string().trim().min(1, "Enter your IAB membership number").max(20),
  /** Optional: when given, the reply says whether it matches the IAB record. */
  name: z.string().trim().max(120).optional(),
});

/**
 * GET /api/verification/iab?membershipNo=AA-920&name=… — looks the number up in
 * the IAB public directory and reports the member's tier and standing.
 *
 * Used in three places: the signup form (mounted without auth on the auth
 * router, so it answers people who don't have an account yet), the wizard's
 * "Check" button, and the supervisor's panel to re-run a check by hand.
 */
export async function checkIabMembership(req: Request, res: Response) {
  const parsed = iabSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid membership number" },
    });
  }

  const membershipNo = normalizeMembershipNo(parsed.data.membershipNo);
  if (!membershipNo) {
    return res.status(400).json({
      error: {
        message: "IAB numbers look like AA-920 or S-098, one or two letters, then three digits",
      },
    });
  }

  try {
    const check = await lookupIabMember(membershipNo, parsed.data.name);
    return res.json({ data: { check } });
  } catch (err) {
    // 502: the number may well be fine, we just couldn't ask IAB about it.
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "IAB lookup failed" } });
  }
}

const submitSchema = z.object({
  message: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
  /**
   * Set when the applicant chose to bypass an automated check and go straight
   * to a human. It never skips the check — the result is still recorded and
   * shown to the supervisor — it only stops two specific disagreements from
   * blocking the submission: an IAB name that doesn't match the account, and an
   * NID card whose photographed number the reader read differently. Both have
   * innocent explanations often enough that a person should get to make the
   * case; nothing else it could raise does.
   */
  manualReview: z.boolean().optional(),
});

/**
 * POST /api/verification/submit — a professional sends their profile for
 * review. Requires the credentials a supervisor will actually check (license
 * body + number), moves the account to UNDER_REVIEW, and opens a request in
 * the supervisor's queue. Route-guarded to the four professional roles.
 */
export async function submitVerification(req: Request, res: Response) {
  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const user = await User.findById(req.auth!.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  if (user.verificationStatus === VerificationStatus.APPROVED) {
    return res.status(409).json({ error: { message: "You're already verified" } });
  }

  const open = await VerificationRequest.findOne({
    professional: user._id,
    status: { $in: [VerificationStatus.DOCUMENTS_SUBMITTED, VerificationStatus.UNDER_REVIEW] },
  });
  if (open) {
    return res.status(409).json({ error: { message: "Your request is already under review" } });
  }

  // Decrypted, because everything below compares real values: the completion
  // checklist, the pre-screen, and the grading of its result.
  const userId = user._id.toString();
  const profile = (openProfile(user.toObject().profile, userId) ?? {}) as ProfessionalProfile &
    LandOwnerProfile;

  // Every professional role now goes through its own verification wizard, and
  // each one has its own mandatory checklist — an architect's IAB membership, an
  // engineer's IEB membership and seal, a contractor's or supplier's trade
  // licence and TIN. The same function the wizard uses to light up its progress
  // bar is re-run here, so the rules hold even if the browser is bypassed.
  const completion = computeCompletion(profile, user.role);
  if (!completion.mandatoryComplete) {
    return res.status(400).json({
      error: {
        message: `Complete the mandatory items first: ${completion.missingMandatory.join(", ")}`,
      },
    });
  }

  // The identity pre-screen, run here rather than trusted from the browser.
  // /api/nid/check exists so the wizard can show a result while someone is
  // still filling the form, but this is the run that counts — it reads the
  // profile as stored and its answer is what a supervisor sees.
  //
  // gradeNidCheck decides what refuses a submission and what is only a flag.
  // Blockers are things that can't be true of a real applicant giving their own
  // number; everything else goes through and the supervisor weighs it.
  try {
    profile.nidCheck = await runNidCheck(userId, claimFromProfile(user.name, profile));
    profile.nid = profile.nidCheck.nid || profile.nid;
  } catch (err) {
    // Never let an outage cost somebody their submission — the same rule the
    // IAB and credential pre-screens already follow.
    console.error("[nid] pre-screen failed during submit:", err);
  }

  const grade = gradeNidCheck(profile.nidCheck);
  if (grade.severity === "FAIL") {
    // One exception to "blockers refuse": when the only complaint is that the
    // card reads a different number, the applicant can send it to a human
    // instead. OCR misreads a digit on a bad photograph often enough that
    // refusing outright would strand real people — and this is exactly the
    // escape hatch the IAB name mismatch already uses.
    const onlyOcrDisagrees =
      grade.blockers.length === 1 && profile.nidCheck?.ocr?.nidMatches === false;

    if (!onlyOcrDisagrees || !parsed.data.manualReview) {
      return res.status(409).json({
        error: {
          code: onlyOcrDisagrees ? "NID_CARD_MISMATCH" : "NID_CHECK_FAILED",
          message: `The NID check didn't pass: ${grade.blockers.join(" · ")}`,
        },
      });
    }
  }

  // Automated pre-screening: record what the IAB directory says about the
  // membership number being submitted, so the supervisor reviews a result the
  // server fetched rather than one the browser claimed.
  //
  // Only one outcome blocks: the directory has this number, and it belongs to
  // somebody else. Everything else — a number IAB doesn't list, a suspended
  // membership, IAB being unreachable — goes through carrying a flag, because
  // the supervisor is the real gate and nobody gets verified without them.
  if (user.role === UserRole.ARCHITECT && profile.licenseNumber) {
    const membershipNo = normalizeMembershipNo(profile.licenseNumber);
    if (membershipNo) {
      try {
        const check = await lookupIabMember(membershipNo, user.name);
        if (check.nameMatches === false && !parsed.data.manualReview) {
          return res.status(409).json({
            error: {
              code: "IAB_NAME_MISMATCH",
              message:
                `IAB lists ${membershipNo} under the name "${check.member!.name}", but this ` +
                `account is named "${user.name}". Correct whichever is wrong, or send it for ` +
                `manual review if the directory has your name recorded differently.`,
            },
          });
        }
        // Written on the decrypted copy; it is sealed back onto the user below.
        profile.iabCheck = check;

        // Catches architects who signed up without a membership number and
        // added it here: keep IAB's address as the secondary contact, but never
        // overwrite one they set themselves.
        const iabEmail = check.member?.email;
        if (iabEmail && !user.recoveryEmail && iabEmail !== user.email) {
          user.recoveryEmail = iabEmail;
        }
      } catch (err) {
        // Couldn't reach IAB. Not the applicant's problem — let it through.
        console.error("[iab] lookup failed during submit:", err);
      }
    }
  }

  // The other professions have no public register to look their credentials up
  // in, so they get the structural pre-screen instead: right shape, not expired,
  // not already claimed by another account. Nothing here blocks a submission —
  // the supervisor is the gate, and they see every flag it raises.
  //
  // Land owners are skipped: they hold no professional credential at all, so
  // there would be nothing to screen and an empty record would read as
  // "checked, found nothing wrong", which is a different claim.
  if (user.role !== UserRole.ARCHITECT && user.role !== UserRole.LAND_OWNER) {
    normalizeCredentials(user.role, profile);
    try {
      profile.credentialCheck = await screenCredentials(user._id.toString(), user.role, profile);
    } catch (err) {
      // A failed screen must never cost someone their submission.
      console.error("[credentials] pre-screen failed during submit:", err);
    }
  }

  // `profile` is a decrypted *copy*, not the stored subdocument — so it has to
  // be sealed and assigned back, not just marked modified. (It used to be the
  // same object, which is why markModified alone was enough before.)
  user.profile = sealProfile(profile, userId);
  user.markModified("profile");

  // Submission lands as DOCUMENTS_SUBMITTED; it becomes UNDER_REVIEW when a
  // supervisor actually opens the request.
  const request = await VerificationRequest.create({
    professional: user._id,
    status: VerificationStatus.DOCUMENTS_SUBMITTED,
    message: parsed.data.message,
    manualReview: parsed.data.manualReview === true,
  });

  user.verificationStatus = VerificationStatus.DOCUMENTS_SUBMITTED;
  await user.save();

  await request.populate("professional");

  // Put it in front of the supervisors so the queue doesn't sit unnoticed.
  const admins = await User.find({ role: UserRole.ADMIN }).select("_id");
  notifyMany(
    admins.map((a) => a._id.toString()),
    {
      type: NotificationType.VERIFICATION,
      title: "New verification request",
      body: `${user.name} (${user.role.replace(/_/g, " ").toLowerCase()}) submitted their documents for review.`,
      link: "/supervisor",
      actorId: user._id.toString(),
    }
  );

  return res.status(201).json({
    data: { request: toVerificationRequest(request as unknown as PopulatedRequest) },
  });
}

/**
 * GET /api/verification/mine — the professional's most recent request, so
 * their profile page can show "under review" / the rejection note. `null`
 * when they've never submitted.
 */
export async function getMyVerification(req: Request, res: Response) {
  const request = await VerificationRequest.findOne({ professional: req.auth!.sub })
    .sort({ createdAt: -1 })
    .populate<{ professional: HydratedDocument<UserDoc> }>("professional");
  return res.json({
    data: { request: request ? toVerificationRequest(request) : null },
  });
}

/**
 * GET /api/verification/requests?status= — the supervisor's queue. Defaults
 * to the open (UNDER_REVIEW) requests; pass APPROVED/REJECTED for history.
 */
export async function listVerificationRequests(req: Request, res: Response) {
  const statusParam = String(req.query.status ?? VerificationStatus.UNDER_REVIEW);
  const status = Object.values(VerificationStatus).includes(statusParam as VerificationStatus)
    ? (statusParam as VerificationStatus)
    : VerificationStatus.UNDER_REVIEW;

  // The open queue covers both pre-review stages: freshly submitted requests
  // and ones a supervisor has already opened.
  const filter =
    status === VerificationStatus.UNDER_REVIEW
      ? {
          status: {
            $in: [VerificationStatus.DOCUMENTS_SUBMITTED, VerificationStatus.UNDER_REVIEW],
          },
        }
      : { status };

  const docs = await VerificationRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ professional: HydratedDocument<UserDoc> }>("professional");

  return res.json({ data: { requests: docs.map(toVerificationRequest) } });
}

/**
 * GET /api/verification/requests/:id — one request plus the professional's
 * full account (email, phone, license number, education, portfolio…) so the
 * supervisor can actually check the credentials. Supervisor-only — this is
 * deliberately more than the public profile exposes.
 */
export async function getVerificationRequest(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Request not found" } });
  }
  const doc = await VerificationRequest.findById(id).populate<{
    professional: HydratedDocument<UserDoc>;
  }>("professional");
  if (!doc || !doc.professional) {
    return res.status(404).json({ error: { message: "Request not found" } });
  }

  // A supervisor opening a fresh submission moves it into UNDER_REVIEW — the
  // professional sees their badge advance from "Submitted" to "In review".
  if (doc.status === VerificationStatus.DOCUMENTS_SUBMITTED) {
    doc.status = VerificationStatus.UNDER_REVIEW;
    await doc.save();
    doc.professional.verificationStatus = VerificationStatus.UNDER_REVIEW;
    await doc.professional.save();
  }

  const professional = doc.professional.toObject();
  return res.json({
    data: {
      request: toVerificationRequest(doc),
      professional: {
        id: doc.professional._id.toString(),
        name: professional.name,
        username: professional.username,
        email: professional.email,
        phone: professional.phone,
        role: professional.role,
        verificationStatus: professional.verificationStatus,
        // The supervisor is the one reviewer who legitimately needs the NID and
        // the pre-screen, so this view decrypts. It is already ADMIN-only at
        // the route.
        profile: openProfile(professional.profile, professional._id.toString()),
      },
    },
  });
}

const decideSchema = z.object({
  action: z.enum(["approve", "reject"], { message: "Action must be approve or reject" }),
  note: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
});

/**
 * POST /api/verification/requests/:id/decide — the supervisor approves or
 * rejects an open request. Updates both the request and the professional's
 * own verificationStatus (which drives the badge everywhere).
 */
export async function decideVerificationRequest(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Request not found" } });
  }
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const doc = await VerificationRequest.findById(id).populate<{
    professional: HydratedDocument<UserDoc>;
  }>("professional");
  if (!doc || !doc.professional) {
    return res.status(404).json({ error: { message: "Request not found" } });
  }
  if (
    doc.status !== VerificationStatus.UNDER_REVIEW &&
    doc.status !== VerificationStatus.DOCUMENTS_SUBMITTED
  ) {
    return res.status(409).json({ error: { message: "This request has already been decided" } });
  }

  const approved = parsed.data.action === "approve";
  doc.status = approved ? VerificationStatus.APPROVED : VerificationStatus.REJECTED;
  doc.note = parsed.data.note;
  doc.decidedAt = new Date();
  await doc.save();

  doc.professional.verificationStatus = doc.status;
  await doc.professional.save();

  notify(doc.professional._id.toString(), {
    type: NotificationType.VERIFICATION,
    title: approved ? "You're Platform Verified ✅" : "Verification not approved",
    body: approved
      ? "Your documents checked out. The verified badge is now on your profile and listings."
      : parsed.data.note?.trim() ||
        "A supervisor reviewed your documents and couldn't approve them. Update your profile and submit again.",
    link: "/profile/professional",
    actorId: req.auth!.sub,
  });

  return res.json({ data: { request: toVerificationRequest(doc) } });
}
