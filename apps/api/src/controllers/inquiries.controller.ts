import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import { InquiryStatus, UserRole, type Inquiry as InquiryDto } from "@buildora/shared";
import { Inquiry, type InquiryDoc } from "../models/Inquiry";
import { User } from "../models/User";

const createInquirySchema = z.object({
  architectId: z.string().min(1, "Choose an architect"),
  message: z
    .string()
    .trim()
    .min(10, "Add a short message (at least 10 characters)")
    .max(1000, "Message is too long"),
});

// A populated inquiry has its landOwner/architect refs replaced by user docs.
type PopulatedRef = { _id: unknown; name: string; username: string; profile?: { company?: string } };

/** Shapes an inquiry (with landOwner + architect populated) for the client. */
function toInquiryDto(doc: HydratedDocument<InquiryDoc>): InquiryDto {
  const landOwner = doc.landOwner as unknown as PopulatedRef;
  const architect = doc.architect as unknown as PopulatedRef;
  return {
    id: doc._id.toString(),
    landOwner: {
      id: String(landOwner._id),
      name: landOwner.name,
      username: landOwner.username,
    },
    architect: {
      id: String(architect._id),
      name: architect.name,
      username: architect.username,
      company: architect.profile?.company,
    },
    message: doc.message,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const withRefs = [
  { path: "landOwner", select: "name username" },
  { path: "architect", select: "name username profile.company" },
];

/**
 * POST /api/inquiries — a land owner contacts an architect. Guards: target must
 * exist and be an architect, and the land owner can't have an open request to
 * the same architect (the model's partial unique index also enforces this).
 */
export async function createInquiry(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = createInquirySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.issues },
    });
  }
  const { architectId, message } = parsed.data;

  if (!isValidObjectId(architectId)) {
    return res.status(404).json({ error: { message: "Architect not found" } });
  }
  const architect = await User.findById(architectId);
  if (!architect || architect.role !== UserRole.ARCHITECT) {
    return res.status(404).json({ error: { message: "Architect not found" } });
  }

  // Block a second open request to the same architect (friendlier than letting
  // the unique index throw a duplicate-key error).
  const existing = await Inquiry.findOne({
    landOwner: req.auth.sub,
    architect: architectId,
    status: { $ne: InquiryStatus.DECLINED },
  });
  if (existing) {
    return res.status(409).json({
      error: { message: "You already have an open request with this architect" },
    });
  }

  const created = await Inquiry.create({
    landOwner: req.auth.sub,
    architect: architectId,
    message,
  });
  const populated = await created.populate(withRefs);
  return res.status(201).json({ data: { inquiry: toInquiryDto(populated) } });
}

/**
 * GET /api/inquiries/mine — the caller's inquiries. A land owner sees the
 * requests they sent; an architect (or other professional) sees the ones they
 * received. Same endpoint, filtered by which side the caller is on.
 */
export async function listMyInquiries(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const filter =
    req.auth.role === UserRole.LAND_OWNER
      ? { landOwner: req.auth.sub }
      : { architect: req.auth.sub };

  const docs = await Inquiry.find(filter).sort({ createdAt: -1 }).populate(withRefs);
  return res.json({ data: { inquiries: docs.map(toInquiryDto) } });
}
