import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  InquiryStatus,
  NotificationType,
  UserRole,
  VerificationStatus,
  type Inquiry as InquiryDto,
} from "@buildora/shared";
import { Inquiry, type InquiryDoc } from "../models/Inquiry";
import { User } from "../models/User";
import { notify, preview } from "../services/notifications";

/** Roles a land owner can send a contact request to. Suppliers use the marketplace instead. */
const CONTACTABLE_ROLES = [UserRole.ARCHITECT, UserRole.STRUCTURAL_ENGINEER, UserRole.CONTRACTOR];

const createInquirySchema = z.object({
  professionalId: z.string().min(1, "Choose a professional"),
  message: z
    .string()
    .trim()
    .min(10, "Add a short message (at least 10 characters)")
    .max(1000, "Message is too long"),
});

// A populated inquiry has its landOwner/professional refs replaced by user docs.
type PopulatedRef = {
  _id: unknown;
  name: string;
  username: string;
  role: UserRole;
  profile?: { company?: string };
};

/** Shapes an inquiry (with landOwner + professional populated) for the client. */
function toInquiryDto(doc: HydratedDocument<InquiryDoc>): InquiryDto {
  const landOwner = doc.landOwner as unknown as PopulatedRef;
  const professional = doc.professional as unknown as PopulatedRef;
  return {
    id: doc._id.toString(),
    landOwner: {
      id: String(landOwner._id),
      name: landOwner.name,
      username: landOwner.username,
    },
    professional: {
      id: String(professional._id),
      name: professional.name,
      username: professional.username,
      role: professional.role,
      company: professional.profile?.company,
    },
    message: doc.message,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const withRefs = [
  { path: "landOwner", select: "name username" },
  { path: "professional", select: "name username role profile.company" },
];

/**
 * POST /api/inquiries — a land owner contacts a professional (architect,
 * structural engineer, or contractor). Guards: target must exist and be a
 * contactable role, and the land owner can't have an open request to the same
 * professional (the model's partial unique index also enforces this).
 */
export async function createInquiry(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = createInquirySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { professionalId, message } = parsed.data;

  if (!isValidObjectId(professionalId)) {
    return res.status(404).json({ error: { message: "Professional not found" } });
  }
  const professional = await User.findById(professionalId);
  if (!professional || !CONTACTABLE_ROLES.includes(professional.role)) {
    return res.status(404).json({ error: { message: "Professional not found" } });
  }

  // Unverified professionals can be browsed but not engaged. Nobody should be
  // able to commit money and a building to someone whose credentials and NID a
  // supervisor hasn't checked yet.
  if (professional.verificationStatus !== VerificationStatus.APPROVED) {
    return res.status(403).json({
      error: {
        code: "PROFESSIONAL_NOT_VERIFIED",
        message:
          `${professional.name} isn't Platform Verified yet, so you can't contact them. ` +
          `You can still view their profile and portfolio.`,
      },
    });
  }

  // Block a second open request to the same professional (friendlier than
  // letting the unique index throw a duplicate-key error).
  const existing = await Inquiry.findOne({
    landOwner: req.auth.sub,
    professional: professionalId,
    status: { $ne: InquiryStatus.DECLINED },
  });
  if (existing) {
    return res.status(409).json({
      error: { message: "You already have an open request with this professional" },
    });
  }

  const created = await Inquiry.create({
    landOwner: req.auth.sub,
    professional: professionalId,
    message,
  });
  const populated = await created.populate(withRefs);

  // Tell the professional a client is asking for them.
  const landOwner = populated.landOwner as unknown as PopulatedRef;
  notify(professionalId, {
    type: NotificationType.INQUIRY,
    title: `New request from ${landOwner.name}`,
    body: preview(message),
    link: "/inquiries",
    actorId: req.auth.sub,
  });

  return res.status(201).json({ data: { inquiry: toInquiryDto(populated) } });
}

/**
 * GET /api/inquiries/mine — the caller's inquiries. A land owner sees the
 * requests they sent; a professional sees the ones they received. Same
 * endpoint, filtered by which side the caller is on.
 */
export async function listMyInquiries(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const filter =
    req.auth.role === UserRole.LAND_OWNER
      ? { landOwner: req.auth.sub }
      : { professional: req.auth.sub };

  const docs = await Inquiry.find(filter).sort({ createdAt: -1 }).populate(withRefs);
  return res.json({ data: { inquiries: docs.map(toInquiryDto) } });
}
