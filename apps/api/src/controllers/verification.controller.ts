import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  VerificationStatus,
  type ProfessionalProfile,
  type VerificationRequest as VerificationRequestShape,
} from "@buildora/shared";
import { User, type UserDoc } from "../models/User";
import { VerificationRequest, type VerificationRequestDoc } from "../models/VerificationRequest";

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
    createdAt: doc.createdAt.toISOString(),
    decidedAt: doc.decidedAt?.toISOString(),
  };
}

const submitSchema = z.object({
  message: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
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
    status: VerificationStatus.UNDER_REVIEW,
  });
  if (open) {
    return res.status(409).json({ error: { message: "Your request is already under review" } });
  }

  const profile = (user.profile ?? {}) as ProfessionalProfile;
  if (!profile.licenseAuthority || !profile.licenseNumber) {
    return res.status(400).json({
      error: {
        message:
          "Add your license body and license number to your profile before requesting verification",
      },
    });
  }

  const request = await VerificationRequest.create({
    professional: user._id,
    message: parsed.data.message,
  });

  user.verificationStatus = VerificationStatus.UNDER_REVIEW;
  await user.save();

  await request.populate("professional");
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

  const docs = await VerificationRequest.find({ status })
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
  if (doc.status !== VerificationStatus.UNDER_REVIEW) {
    return res.status(409).json({ error: { message: "This request has already been decided" } });
  }

  const approved = parsed.data.action === "approve";
  doc.status = approved ? VerificationStatus.APPROVED : VerificationStatus.REJECTED;
  doc.note = parsed.data.note;
  doc.decidedAt = new Date();
  await doc.save();

  doc.professional.verificationStatus = doc.status;
  await doc.professional.save();

  return res.json({ data: { request: toVerificationRequest(doc) } });
}
