import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  ProjectStatus,
  UserRole,
  type EcpsApplication as EcpsApplicationDto,
} from "@buildora/shared";
import { EcpsApplication, type EcpsApplicationDoc } from "../models/EcpsApplication";
import { EcpsStep } from "../models/EcpsStep";
import type { ProjectDoc } from "../models/Project";
import { findProjectOr404 } from "./projects.controller";

function toEcpsApplicationDto(doc: HydratedDocument<EcpsApplicationDoc>): EcpsApplicationDto {
  return {
    id: doc._id.toString(),
    projectId: String(doc.project),
    currentStepOrder: doc.currentStepOrder,
    completed: doc.completed,
    history: doc.history.map((h) => ({
      stepOrder: h.stepOrder,
      note: h.note,
      at: h.at.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The owner or the engaged architect drive the permit tracker (admins may look). */
function canTrack(project: HydratedDocument<ProjectDoc>, auth: { sub: string; role: UserRole }) {
  return (
    String(project.owner) === auth.sub ||
    (project.architect && String(project.architect) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

// Stages from PERMIT_STAGE onward — the permit can still be tracked while the
// building goes up (occupancy steps happen post-construction too).
const TRACKABLE_STATUSES = [
  ProjectStatus.PERMIT_STAGE,
  ProjectStatus.UNDER_CONSTRUCTION,
  ProjectStatus.COMPLETED,
];

/** GET /api/projects/:id/ecps — the project's application, or null if not started. */
export async function getEcpsApplication(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canTrack(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const doc = await EcpsApplication.findOne({ project: project._id });
  return res.json({ data: { application: doc ? toEcpsApplicationDto(doc) : null } });
}

/**
 * POST /api/projects/:id/ecps — start tracking the ECPS application once the
 * project reaches the permit stage. Begins at the first configured step.
 */
export async function startEcpsApplication(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canTrack(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (!TRACKABLE_STATUSES.includes(project.status)) {
    return res.status(400).json({
      error: { message: "The project must reach the permit stage before tracking ECPS" },
    });
  }

  const existing = await EcpsApplication.findOne({ project: project._id });
  if (existing) {
    return res.status(409).json({ error: { message: "ECPS tracking has already started" } });
  }

  const firstStep = await EcpsStep.findOne().sort({ order: 1 });
  if (!firstStep) {
    return res.status(503).json({
      error: { message: "No ECPS steps are configured yet — ask a supervisor to add them" },
    });
  }

  const doc = await EcpsApplication.create({
    project: project._id,
    currentStepOrder: firstStep.order,
  });
  return res.status(201).json({ data: { application: toEcpsApplicationDto(doc) } });
}

const advanceSchema = z.object({
  note: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

/**
 * POST /api/projects/:id/ecps/advance — mark the current step done (with an
 * optional note for the audit trail) and move to the next configured step.
 * Finishing the last step completes the application.
 */
export async function advanceEcpsApplication(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canTrack(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const doc = await EcpsApplication.findOne({ project: project._id });
  if (!doc) {
    return res.status(404).json({ error: { message: "ECPS tracking hasn't started yet" } });
  }
  if (doc.completed) {
    return res.status(400).json({ error: { message: "The application is already complete" } });
  }

  const parsed = advanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  doc.history.push({ stepOrder: doc.currentStepOrder, note: parsed.data.note, at: new Date() });

  const nextStep = await EcpsStep.findOne({ order: { $gt: doc.currentStepOrder } }).sort({
    order: 1,
  });
  if (nextStep) {
    doc.currentStepOrder = nextStep.order;
  } else {
    doc.completed = true;
  }
  await doc.save();

  return res.json({ data: { application: toEcpsApplicationDto(doc) } });
}
