import type { Request, Response } from "express";
import { z } from "zod";
import {
  DHAKA_TIME_ZONE,
  LabourTrade,
  SITE_RADIUS_M,
  UserRole,
  distanceMetres,
  type AttendanceSummary,
  type SiteCheckIn as SiteCheckInDto,
} from "@buildora/shared";
import { SiteCheckIn } from "../models/SiteCheckIn";
import { findProjectOr404 } from "./projects.controller";
import type { HydratedDocument } from "mongoose";
import type { SiteCheckInDoc } from "../models/SiteCheckIn";

/**
 * Geofenced site attendance.
 *
 * The site diary's headcount is typed from memory at the end of the day; this
 * is the same number captured as it happens, from a phone on the plot. The
 * diary then pre-fills from it, so the two can't disagree.
 *
 * Being outside the radius does not block a check-in. GPS is wrong often
 * enough — indoors, under a slab, in a street of tall buildings — that refusing
 * would punish people who really are standing there, and a foreman who gets
 * rejected once stops using the feature. It's recorded as a flag instead, and a
 * supervisor reading the day can weigh it.
 */

/** Today's date in Dhaka, which is the day a site actually works to. */
function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toDto(doc: HydratedDocument<SiteCheckInDoc>): SiteCheckInDto {
  const who = doc.recordedBy as unknown as
    { _id: unknown; name: string; username: string; company?: string } | undefined;
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    date: doc.date,
    recordedBy: who?.name
      ? { id: String(who._id), name: who.name, username: who.username, company: who.company }
      : { id: String(doc.recordedBy), name: "", username: "" },
    trade: doc.trade,
    count: doc.count,
    lat: doc.lat,
    lng: doc.lng,
    distanceFromPlotM: doc.distanceFromPlotM,
    onSite: doc.onSite,
    note: doc.note,
    checkedInAt: doc.checkedInAt.toISOString(),
    checkedOutAt: doc.checkedOutAt?.toISOString(),
  };
}

const recorderRef = { path: "recordedBy", select: "name username company" };

/** Everyone working the site can record and read attendance. */
async function loadProject(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return null;

  const callerId = req.auth!.sub;
  const allowed =
    String(project.owner) === callerId ||
    String(project.architect ?? "") === callerId ||
    String(project.engineer ?? "") === callerId ||
    req.auth!.role === UserRole.ADMIN;
  if (!allowed) {
    res.status(404).json({ error: { message: "Project not found" } });
    return null;
  }
  return project;
}

const checkInSchema = z.object({
  trade: z.enum(LabourTrade, { message: "Pick a trade" }),
  count: z.coerce.number().int().min(1, "At least one person").max(2000),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  note: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(300).optional()
  ),
});

/** POST /api/projects/:id/attendance — record a crew arriving. */
export async function checkIn(req: Request, res: Response) {
  const project = await loadProject(req, res);
  if (!project) return;

  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const { trade, count, lat, lng, note } = parsed.data;

  // The plot pin is optional on a project, so the geofence is best-effort: with
  // no pin there is nothing to measure against and the record simply stands.
  const pin = project.location;
  const distance = pin ? distanceMetres({ lat: pin.lat, lng: pin.lng }, { lat, lng }) : undefined;

  const doc = await SiteCheckIn.create({
    project: project._id,
    date: dhakaToday(),
    recordedBy: req.auth!.sub,
    trade,
    count,
    lat,
    lng,
    distanceFromPlotM: distance,
    onSite: distance === undefined ? true : distance <= SITE_RADIUS_M,
    note,
  });

  await doc.populate(recorderRef);
  return res.status(201).json({ data: { checkIn: toDto(doc) } });
}

/** POST /api/projects/:id/attendance/:checkInId/out — the crew leaves. */
export async function checkOut(req: Request, res: Response) {
  const project = await loadProject(req, res);
  if (!project) return;

  const doc = await SiteCheckIn.findOne({
    _id: req.params.checkInId,
    project: project._id,
  });
  if (!doc) return res.status(404).json({ error: { message: "Check-in not found" } });
  if (doc.checkedOutAt) {
    return res.status(409).json({ error: { message: "Already checked out" } });
  }

  doc.checkedOutAt = new Date();
  await doc.save();
  await doc.populate(recorderRef);
  return res.json({ data: { checkIn: toDto(doc) } });
}

/**
 * GET /api/projects/:id/attendance?date=YYYY-MM-DD — one day's records and its
 * totals. Defaults to today in Dhaka, which is the day a site works to.
 */
export async function listAttendance(req: Request, res: Response) {
  const project = await loadProject(req, res);
  if (!project) return;

  const raw = String(req.query.date ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dhakaToday();

  const docs = await SiteCheckIn.find({ project: project._id, date })
    .sort({ checkedInAt: 1 })
    .populate(recorderRef);

  // Totalled per trade, which is exactly the shape the site diary's labour
  // block wants — so a diary entry can be pre-filled instead of retyped.
  const byTrade = new Map<LabourTrade, number>();
  for (const d of docs) {
    byTrade.set(d.trade, (byTrade.get(d.trade) ?? 0) + d.count);
  }

  const summary: AttendanceSummary = {
    date,
    headcount: docs.reduce((sum, d) => sum + d.count, 0),
    byTrade: [...byTrade.entries()].map(([trade, count]) => ({ trade, count })),
    offSiteRecords: docs.filter((d) => !d.onSite).length,
  };

  return res.json({ data: { checkIns: docs.map(toDto), summary } });
}

/** DELETE /api/projects/:id/attendance/:checkInId — undo a mistaken record. */
export async function deleteCheckIn(req: Request, res: Response) {
  const project = await loadProject(req, res);
  if (!project) return;

  const doc = await SiteCheckIn.findOne({ _id: req.params.checkInId, project: project._id });
  if (!doc) return res.status(404).json({ error: { message: "Check-in not found" } });

  // Whoever recorded it, or the owner. A wrong headcount should be fixable by
  // the person who typed it without waiting for anybody.
  const callerId = req.auth!.sub;
  if (String(doc.recordedBy) !== callerId && String(project.owner) !== callerId) {
    return res.status(403).json({ error: { message: "You can only remove your own records" } });
  }

  await doc.deleteOne();
  return res.json({ data: { removed: true } });
}
