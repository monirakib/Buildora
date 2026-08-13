import type { Request, Response } from "express";
import { z } from "zod";
import {
  NotificationType,
  ProjectStatus,
  UserRole,
  warrantyExpiry,
  type Handover as HandoverDto,
} from "@buildora/shared";
import { Handover, type HandoverDoc } from "../models/Handover";
import { notify } from "../services/notifications";
import { findProjectOr404 } from "./projects.controller";
import type { HydratedDocument } from "mongoose";

/**
 * The handover package.
 *
 * Before this, ProjectStatus.COMPLETED meant only that the owner had clicked a
 * button. This is the evidence behind it: the RAJUK occupancy certificate that
 * legally permits the building to be used, and every warranty with the date it
 * runs out.
 *
 * Warranty expiry dates are stored rather than computed on read, because a
 * warranty's end is a commitment made on a particular day — recalculating it
 * later would let a change to the rules silently rewrite what somebody was
 * promised.
 */

function toDto(doc: HydratedDocument<HandoverDoc>): HandoverDto {
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    occupancyCertificateUrl: doc.occupancyCertificateUrl,
    occupancyCertificateNo: doc.occupancyCertificateNo,
    handedOverAt: doc.handedOverAt,
    notes: doc.notes,
    // Listed field by field rather than spread: these are Mongoose
    // subdocuments, and spreading one copies its internals instead of its data.
    warranties: doc.warranties.map((w) => ({
      item: w.item,
      provider: w.provider,
      months: w.months,
      startsAt: w.startsAt,
      expiresAt: w.expiresAt,
      documentUrl: w.documentUrl,
    })),
    acceptedByOwner: doc.acceptedByOwner,
    acceptedAt: doc.acceptedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Everyone who worked on the project can read the handover; only the owner writes. */
async function loadForProject(req: Request, res: Response, needOwner: boolean) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return null;

  const callerId = req.auth!.sub;
  const isOwner = String(project.owner) === callerId;
  const isParticipant =
    isOwner ||
    String(project.architect ?? "") === callerId ||
    String(project.engineer ?? "") === callerId ||
    req.auth!.role === UserRole.ADMIN;

  if (!isParticipant || (needOwner && !isOwner)) {
    res.status(404).json({ error: { message: "Project not found" } });
    return null;
  }
  return { project, isOwner };
}

/** GET /api/projects/:id/handover — the package, or null before one is started. */
export async function getHandover(req: Request, res: Response) {
  const loaded = await loadForProject(req, res, false);
  if (!loaded) return;

  const doc = await Handover.findOne({ project: loaded.project._id });
  return res.json({ data: { handover: doc ? toDto(doc) : null } });
}

const warrantySchema = z.object({
  item: z.string().trim().min(2, "What does this warranty cover?").max(160),
  provider: z.string().trim().min(2, "Who honours it?").max(160),
  months: z.coerce.number().int().min(1, "At least one month").max(600),
  startsAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  documentUrl: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.url("Enter a valid link").optional()
  ),
});

const handoverSchema = z.object({
  occupancyCertificateNo: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(60).optional()
  ),
  occupancyCertificateUrl: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.url("Enter a valid link").optional()
  ),
  handedOverAt: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
      .optional()
  ),
  notes: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(2000).optional()
  ),
  warranties: z.array(warrantySchema).max(40, "At most 40 warranties").default([]),
});

/**
 * PUT /api/projects/:id/handover — the owner records the package.
 *
 * Upserts, because there is exactly one handover per building and editing it
 * before acceptance is normal — certificates arrive at different times.
 */
export async function saveHandover(req: Request, res: Response) {
  const loaded = await loadForProject(req, res, true);
  if (!loaded) return;

  const parsed = handoverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const existing = await Handover.findOne({ project: loaded.project._id });
  // Once the owner has signed it off, it's a record of what was handed over,
  // not a working document.
  if (existing?.acceptedByOwner) {
    return res.status(409).json({
      error: { message: "This handover has been accepted and can no longer be edited" },
    });
  }

  const warranties = parsed.data.warranties.map((w) => ({
    ...w,
    expiresAt: warrantyExpiry(w.startsAt, w.months),
  }));

  const doc = await Handover.findOneAndUpdate(
    { project: loaded.project._id },
    { ...parsed.data, warranties, project: loaded.project._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.json({ data: { handover: toDto(doc!) } });
}

/**
 * POST /api/projects/:id/handover/accept — the owner confirms receipt, which is
 * what finally makes COMPLETED mean something.
 *
 * Requires an occupancy certificate: a building without one is not legally
 * usable, so accepting handover of it would be recording a fiction.
 */
export async function acceptHandover(req: Request, res: Response) {
  const loaded = await loadForProject(req, res, true);
  if (!loaded) return;

  const doc = await Handover.findOne({ project: loaded.project._id });
  if (!doc) {
    return res.status(400).json({ error: { message: "Fill in the handover details first" } });
  }
  if (doc.acceptedByOwner) {
    return res.status(409).json({ error: { message: "You've already accepted this handover" } });
  }
  if (!doc.occupancyCertificateUrl) {
    return res.status(400).json({
      error: { message: "Attach the occupancy certificate before accepting handover" },
    });
  }

  doc.acceptedByOwner = true;
  doc.acceptedAt = new Date();
  if (!doc.handedOverAt) doc.handedOverAt = new Date().toISOString().slice(0, 10);
  await doc.save();

  // Accepting is the real end of the build, so the project follows.
  if (loaded.project.status === ProjectStatus.UNDER_CONSTRUCTION) {
    loaded.project.status = ProjectStatus.COMPLETED;
    await loaded.project.save();
  }

  // Tell everyone who worked on it — this is the moment their warranty clock
  // starts, and the last thing that happens on the project.
  const audience = [loaded.project.architect, loaded.project.engineer].filter(Boolean).map(String);
  for (const userId of new Set(audience)) {
    notify(userId, {
      type: NotificationType.CONTRACT,
      title: "Project handed over",
      body: `${loaded.project.title} has been accepted by the owner. ${doc.warranties.length} warranty record${doc.warranties.length === 1 ? "" : "s"} archived.`,
      link: `/projects/${loaded.project._id.toString()}?tab=documents`,
      actorId: req.auth!.sub,
    });
  }

  return res.json({ data: { handover: toDto(doc) } });
}
