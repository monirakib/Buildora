import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  OpeningKind,
  UserRole,
  floorAreaSqft,
  kathaToSqft,
  wallLengthFt,
  type FloorPlan as FloorPlanDto,
  type PlanCompliance,
} from "@buildora/shared";
import { FloorPlan, type FloorPlanDoc } from "../models/FloorPlan";
import { DapZone } from "../models/DapZone";
import type { ProjectDoc } from "../models/Project";
import { findProjectOr404 } from "./projects.controller";

// The 2D floor plan a project's architect draws before any 3D model exists.
// Geometry arrives from the editor already snapped to the grid; this file
// validates it, stores one document per floor, and measures the drawn area
// against the DAP zone limits held in the database.

type UserRefDoc = { _id: unknown; name: string; username: string; company?: string };

function toFloorPlanDto(doc: HydratedDocument<FloorPlanDoc>): FloorPlanDto {
  // `updatedBy` is only populated on reads that ask for it.
  const editor = doc.updatedBy as unknown as UserRefDoc | undefined;
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    level: doc.level,
    walls: doc.walls,
    rooms: doc.rooms,
    openings: doc.openings,
    gridStepFt: doc.gridStepFt,
    updatedBy:
      editor && typeof editor === "object" && "name" in editor
        ? {
            id: String(editor._id),
            name: editor.name,
            username: editor.username,
            company: editor.company,
          }
        : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Plans are visible to the people on the project: owner, architect, or admin. */
function canViewPlans(
  project: HydratedDocument<ProjectDoc>,
  auth: { sub: string; role: UserRole }
) {
  return (
    String(project.owner) === auth.sub ||
    (project.architect && String(project.architect) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

/**
 * Only the engaged architect draws. The land owner opens the plan read-only —
 * they commissioned the design, they don't redline it directly. (When owner
 * change-suggestions land later, they go in as their own request/response
 * flow, not by widening this check.)
 */
function canEditPlans(
  project: HydratedDocument<ProjectDoc>,
  auth: { sub: string; role: UserRole }
) {
  return (
    (project.architect && String(project.architect) === auth.sub) || auth.role === UserRole.ADMIN
  );
}

const pointSchema = z.object({
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
});

const wallSchema = z.object({
  id: z.string().trim().min(1).max(40),
  x1: z.number().finite().min(-5000).max(5000),
  y1: z.number().finite().min(-5000).max(5000),
  x2: z.number().finite().min(-5000).max(5000),
  y2: z.number().finite().min(-5000).max(5000),
  thicknessIn: z.number().min(2).max(24),
});

const roomSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1, "Name every room").max(40),
  points: z.array(pointSchema).min(3, "A room needs at least three corners").max(60),
});

const openingSchema = z.object({
  id: z.string().trim().min(1).max(40),
  wallId: z.string().trim().min(1).max(40),
  offsetFt: z.number().min(0).max(5000),
  widthFt: z.number().min(0.5).max(40),
  kind: z.enum(OpeningKind, { message: "An opening is either a door or a window" }),
});

const savePlanSchema = z
  .object({
    walls: z.array(wallSchema).max(400),
    rooms: z.array(roomSchema).max(120),
    openings: z.array(openingSchema).max(400),
    gridStepFt: z.number().min(0.25).max(10),
  })
  .superRefine((plan, ctx) => {
    // An opening is a hole in a specific wall, so it must name a wall that
    // exists and must actually fit inside that wall's length.
    const byId = new Map(plan.walls.map((w) => [w.id, w]));
    for (const opening of plan.openings) {
      const wall = byId.get(opening.wallId);
      if (!wall) {
        ctx.addIssue({
          code: "custom",
          message: "An opening refers to a wall that isn't on this floor",
          path: ["openings"],
        });
        continue;
      }
      if (opening.offsetFt + opening.widthFt > wallLengthFt(wall) + 0.01) {
        ctx.addIssue({
          code: "custom",
          message: `A ${opening.kind.toLowerCase()} is wider than the wall it sits on`,
          path: ["openings"],
        });
      }
    }
  });

const levelSchema = z.coerce.number().int().min(0).max(49);

/**
 * Measures what has been drawn against the DAP zone rules for the project's
 * area. Both limits come from the admin-editable DapZone collection — nothing
 * about FAR or ground coverage is hardcoded here.
 *
 * Floor area is the sum of the room polygons on each level (shoelace formula,
 * in `@buildora/shared`). That is the enclosed usable area; RAJUK measures
 * gross covered area including wall thickness, so treat this as an indicative
 * check during design, not a substitute for the formal submission.
 */
async function computeCompliance(
  project: HydratedDocument<ProjectDoc>,
  plans: HydratedDocument<FloorPlanDoc>[]
): Promise<PlanCompliance> {
  const plotAreaSqft = kathaToSqft(project.landAreaKatha);

  const ground = plans.find((p) => p.level === 0);
  const groundFloorAreaSqft = ground ? floorAreaSqft(ground.rooms) : 0;
  const totalBuiltAreaSqft = plans.reduce((sum, p) => sum + floorAreaSqft(p.rooms), 0);
  const floorsDrawn = plans.filter((p) => p.rooms.length > 0).length;

  const far = plotAreaSqft > 0 ? totalBuiltAreaSqft / plotAreaSqft : 0;
  const groundCoveragePct = plotAreaSqft > 0 ? (groundFloorAreaSqft / plotAreaSqft) * 100 : 0;

  // Match the zone on the project's locality, case-insensitively.
  const safeArea = project.areaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const zone = await DapZone.findOne({ areaName: new RegExp(`^${safeArea}$`, "i") });

  const base = {
    plotAreaSqft: Math.round(plotAreaSqft),
    groundFloorAreaSqft: Math.round(groundFloorAreaSqft),
    totalBuiltAreaSqft: Math.round(totalBuiltAreaSqft),
    far: Number(far.toFixed(2)),
    groundCoveragePct: Number(groundCoveragePct.toFixed(1)),
    floorsDrawn,
  };

  if (!zone) {
    return {
      ...base,
      verdict: "no-zone",
      issues: [`No DAP zone record covers "${project.areaName}" yet.`],
    };
  }

  const issues: string[] = [];
  if (far > zone.maxFar) {
    issues.push(
      `Built area gives FAR ${base.far}, above the ${zone.maxFar} allowed in ${zone.zoneCode}.`
    );
  }
  if (groundCoveragePct > zone.maxGroundCoveragePct) {
    issues.push(
      `Ground coverage is ${base.groundCoveragePct}%, above the ${zone.maxGroundCoveragePct}% allowed.`
    );
  }
  if (zone.maxFloors && floorsDrawn > zone.maxFloors) {
    issues.push(`${floorsDrawn} floors drawn, but only ${zone.maxFloors} are allowed here.`);
  }

  return {
    ...base,
    zoneCode: zone.zoneCode,
    maxFar: zone.maxFar,
    maxGroundCoveragePct: zone.maxGroundCoveragePct,
    maxFloors: zone.maxFloors,
    verdict: issues.length > 0 ? "over" : "ok",
    issues,
  };
}

/**
 * GET /api/projects/:id/floor-plans — every floor drawn so far, lowest first,
 * plus the live FAR/coverage check. One request loads the whole editor.
 */
export async function listFloorPlans(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const plans = await FloorPlan.find({ project: project._id })
    .sort({ level: 1 })
    .populate({ path: "updatedBy", select: "name username company" });

  return res.json({
    data: {
      plans: plans.map(toFloorPlanDto),
      compliance: await computeCompliance(project, plans),
      canEdit: canEditPlans(project, req.auth!),
    },
  });
}

/**
 * PUT /api/projects/:id/floor-plans/:level — save one floor. An upsert, so the
 * first save creates the floor and later ones overwrite it; the editor always
 * holds the whole floor in state, so there is nothing to patch incrementally.
 */
export async function saveFloorPlan(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (!canEditPlans(project, req.auth!)) {
    return res
      .status(403)
      .json({ error: { message: "Only the project's architect can edit the plan" } });
  }

  const level = levelSchema.safeParse(req.params.level);
  if (!level.success) {
    return res.status(400).json({ error: { message: "Invalid floor level" } });
  }

  const parsed = savePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid plan",
        details: parsed.error.issues,
      },
    });
  }

  const saved = await FloorPlan.findOneAndUpdate(
    { project: project._id, level: level.data },
    { ...parsed.data, project: project._id, level: level.data, updatedBy: req.auth!.sub },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate({ path: "updatedBy", select: "name username company" });

  // Re-read every floor so the returned compliance reflects this save.
  const plans = await FloorPlan.find({ project: project._id }).sort({ level: 1 });

  return res.json({
    data: {
      plan: toFloorPlanDto(saved),
      compliance: await computeCompliance(project, plans),
    },
  });
}

/** DELETE /api/projects/:id/floor-plans/:level — clear one floor entirely. */
export async function deleteFloorPlan(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (!canEditPlans(project, req.auth!)) {
    return res
      .status(403)
      .json({ error: { message: "Only the project's architect can edit the plan" } });
  }

  const level = levelSchema.safeParse(req.params.level);
  if (!level.success) {
    return res.status(400).json({ error: { message: "Invalid floor level" } });
  }

  await FloorPlan.findOneAndDelete({ project: project._id, level: level.data });
  const plans = await FloorPlan.find({ project: project._id }).sort({ level: 1 });

  return res.json({
    data: { deleted: true, compliance: await computeCompliance(project, plans) },
  });
}
