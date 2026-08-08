import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  NotificationType,
  UserRole,
  VerificationStatus,
  computeCompletion,
  normalizeMembershipNo,
  type ProfessionalProfile,
  type VerificationRequest as VerificationRequestShape,
} from "@buildora/shared";
import { User, type UserDoc } from "../models/User";
import { VerificationRequest, type VerificationRequestDoc } from "../models/VerificationRequest";
import { lookupIabMember } from "../services/iab";
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
        message: "IAB numbers look like AA-920 or S-098 — one or two letters, then three digits",
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
   * Set when the professional chose to bypass the automated IAB check and go
   * straight to a human. It never skips the lookup — the result is still
   * recorded — it only stops a name mismatch from blocking the submission.
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

  const profile = (user.profile ?? {}) as ProfessionalProfile;
  if (user.role === UserRole.ARCHITECT) {
    // Architects go through the full verification wizard — the same mandatory
    // checklist the wizard shows is enforced here so it can't be bypassed.
    const completion = computeCompletion(profile);
    if (!completion.mandatoryComplete) {
      return res.status(400).json({
        error: {
          message: `Complete the mandatory items first: ${completion.missingMandatory.join(", ")}`,
        },
      });
    }
  } else if (!profile.licenseAuthority || !profile.licenseNumber) {
    return res.status(400).json({
      error: {
        message:
          "Add your license body and license number to your profile before requesting verification",
      },
    });
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
        // `profile` is the same object as `user.profile`, just narrowed to the
        // professional shape — writing through it updates the subdocument.
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
        profile: professional.profile,
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
