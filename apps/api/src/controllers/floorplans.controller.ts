import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  ColumnShape,
  DEFAULT_CEILING_FT,
  DEFAULT_SLAB_FT,
  DoorSwing,
  FurnitureKind,
  HingeSide,
  OpeningKind,
  PlanMaterial,
  RoomKind,
  StairRailSide,
  UserRole,
  floorAreaSqft,
  kathaToSqft,
  openingHeadFt,
  wallLengthFt,
  type FloorPlan as FloorPlanDto,
  type PlanCompliance,
} from "@buildora/shared";
import { FloorPlan, type FloorPlanDoc } from "../models/FloorPlan";
import { askGroq, isGroqConfigured } from "../services/groq";
import { DapZone } from "../models/DapZone";
import type { ProjectDoc } from "../models/Project";
import { refreshEstimate } from "../services/estimateLadder";
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
    furniture: doc.furniture,
    stairs: doc.stairs,
    columns: doc.columns,
    gridStepFt: doc.gridStepFt,
    ceilingHeightFt: doc.ceilingHeightFt,
    slabThicknessFt: doc.slabThicknessFt,
    floorMaterial: doc.floorMaterial,
    ceilingMaterial: doc.ceilingMaterial,
    showCeiling: doc.showCeiling,
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
export function canViewPlans(
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
export function canEditPlans(
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

/** Every 3D finish field is the same optional enum. */
const material = z.enum(PlanMaterial).optional();

const wallSchema = z.object({
  id: z.string().trim().min(1).max(40),
  x1: z.number().finite().min(-5000).max(5000),
  y1: z.number().finite().min(-5000).max(5000),
  x2: z.number().finite().min(-5000).max(5000),
  y2: z.number().finite().min(-5000).max(5000),
  thicknessIn: z.number().min(2).max(24),
  heightFt: z.number().min(1).max(30).optional(),
  material,
});

const roomSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1, "Name every room").max(40),
  points: z.array(pointSchema).min(3, "A room needs at least three corners").max(60),
  // Optional so a plan saved before room types existed still validates.
  kind: z.enum(RoomKind).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "A room colour must be a #rrggbb hex value")
    .optional(),
  floorMaterial: material,
  ceilingMaterial: material,
});

const furnitureSchema = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(FurnitureKind, { message: "Unknown furniture type" }),
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
  widthFt: z.number().min(0.5).max(60),
  depthFt: z.number().min(0.5).max(60),
  rotation: z.number().int().min(0).max(359),
  label: z.string().trim().max(40).optional(),
  heightFt: z.number().min(0.2).max(12).optional(),
  mountFt: z.number().min(0).max(12).optional(),
  material,
});

const openingSchema = z.object({
  id: z.string().trim().min(1).max(40),
  wallId: z.string().trim().min(1).max(40),
  offsetFt: z.number().min(0).max(5000),
  widthFt: z.number().min(0.5).max(40),
  kind: z.enum(OpeningKind, { message: "An opening is either a door or a window" }),
  heightFt: z.number().min(1).max(12).optional(),
  sillFt: z.number().min(0).max(10).optional(),
  hinge: z.enum(HingeSide).optional(),
  swing: z.enum(DoorSwing).optional(),
  openDeg: z.number().min(0).max(120).optional(),
  frameMaterial: material,
});

const stairSchema = z.object({
  id: z.string().trim().min(1).max(40),
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
  widthFt: z.number().min(2).max(12),
  runFt: z.number().min(3).max(40),
  rotation: z.number().int().min(0).max(359),
  riseFt: z.number().min(3).max(25).optional(),
  railSide: z.enum(StairRailSide).optional(),
  material,
});

const columnSchema = z.object({
  id: z.string().trim().min(1).max(40),
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
  sizeFt: z.number().min(0.5).max(5),
  shape: z.enum(ColumnShape).optional(),
  heightFt: z.number().min(1).max(30).optional(),
  material,
});

const savePlanSchema = z
  .object({
    walls: z.array(wallSchema).max(400),
    rooms: z.array(roomSchema).max(120),
    openings: z.array(openingSchema).max(400),
    // Defaulted rather than required, so a save that predates furniture (or a
    // browser tab left open across the deploy) stores an empty list instead of
    // failing validation.
    furniture: z.array(furnitureSchema).max(300).default([]),
    // Same reasoning as `furniture` above: defaulted, not required, so a plan
    // saved from a tab that predates the 3D studio still validates.
    stairs: z.array(stairSchema).max(20).default([]),
    columns: z.array(columnSchema).max(200).default([]),
    gridStepFt: z.number().min(0.25).max(10),
    ceilingHeightFt: z.number().min(6).max(20).default(DEFAULT_CEILING_FT),
    slabThicknessFt: z.number().min(0.25).max(2).default(DEFAULT_SLAB_FT),
    floorMaterial: material,
    ceilingMaterial: material,
    showCeiling: z.boolean().default(false),
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
      // Now that openings carry a height and a sill, they can also overshoot
      // the wall vertically — a window set 7 ft up in a 9 ft wall, say. The 3D
      // view would build a lintel of negative height, so catch it here.
      // `ceilingHeightFt` is already defaulted by the time refinement runs.
      const wallTopFt = wall.heightFt ?? plan.ceilingHeightFt;
      if (openingHeadFt(opening) > wallTopFt + 0.01) {
        ctx.addIssue({
          code: "custom",
          message: `A ${opening.kind.toLowerCase()} reaches higher than the wall it is cut into`,
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
 *
 * Furniture is deliberately absent from this: a bed is not floor area, so
 * furnishing a plan never moves the FAR or coverage numbers.
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

  // Now that there's a drawn area, the owner's estimate can stop guessing from
  // the plot size. Plans are saved constantly, so refreshEstimate only writes a
  // new snapshot when the area actually moved — see its 2% guard.
  await refreshEstimate(project);

  return res.json({
    data: {
      plan: toFloorPlanDto(saved),
      compliance: await computeCompliance(project, plans),
    },
  });
}

const ADVICE_SYSTEM_PROMPT = `You are a floor plan advisor for Buildora, a construction platform for Bangladesh. You advise architects and land owners on residential layouts.

How to answer:
- Give sizes in feet, written like "Master bedroom: 14x12 ft".
- Assume Dhaka apartment norms unless told otherwise.
- Bangladesh is hot and humid: cross-ventilation, window placement and shading matter more than they would in a temperate climate. Raise them when they are relevant.
- Be concise and specific. A short paragraph, or a few dash-prefixed lines.
- Plain text only. No markdown headings, no bold, no tables.
- Reply in Bangla if the user writes in Bangla.

About the numbers you are given:
- The plan measurements and the DAP zone limits below are already calculated from the drawing and from Buildora's zone records. Treat them as correct and do not recompute them.
- FAR and ground coverage limits come from RAJUK's DAP rules for that area. Never invent a limit for an area that has no record.
- You advise on design only. RAJUK decides what gets approved.`;

const adviceSchema = z.object({
  /**
   * What is on the editor's canvas right now, written out by the browser.
   *
   * It has to come from the client rather than be read from the database here:
   * the whole point is advice on the drawing in progress, which by definition
   * has not been saved yet.
   */
  grounding: z.string().trim().min(1).max(6000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .min(1, "Ask something first")
    .max(20),
});

/**
 * POST /api/projects/:id/floor-plans/advice — layout advice from Groq.
 *
 * A thin proxy, so the Groq key stays on the server instead of being compiled
 * into the browser bundle. Anyone who can see the project's plans can ask.
 */
export async function floorPlanAdvice(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  if (!isGroqConfigured()) {
    return res.status(503).json({
      error: { message: "The layout advisor isn't configured (no model API key set)" },
    });
  }

  const parsed = adviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid request" } });
  }

  try {
    const reply = await askGroq([
      { role: "system", content: ADVICE_SYSTEM_PROMPT },
      { role: "system", content: `Current plan:\n${parsed.data.grounding}` },
      ...parsed.data.messages,
    ]);
    return res.json({ data: { reply } });
  } catch (err) {
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "Advisor error" } });
  }
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
