import type { Request, Response } from "express";
import { z } from "zod";
import {
  STUDIO_VERSION_LIMIT,
  type StudioDesign as StudioDesignData,
  type StudioLoadResult,
  type StudioVersionSummary,
} from "@buildora/shared";
import { StudioDesign } from "../models/StudioDesign";
import { StudioVersion } from "../models/StudioVersion";
import { canEditPlans, canViewPlans } from "./floorplans.controller";
import { findProjectOr404 } from "./projects.controller";

/**
 * Storage for the BD Design Studio.
 *
 * The studio is a self-contained 3D designer with its own project format (see
 * `packages/shared/src/studio.ts`), so these endpoints do one thing: hold that
 * format faithfully and hand it back. There is no conversion, no derived
 * geometry and no business logic here — the numbers Buildora actually reasons
 * about (built area, FAR, BOQ quantities) come from the `FloorPlan` documents
 * the studio mirrors into on save, which already have their own endpoints and
 * their own validation.
 *
 * Permissions are borrowed wholesale from the floor plans: the same people who
 * can see a project's plans can see its design, and only the engaged architect
 * (or an admin) can change it. Two tools drawing the same building should not
 * disagree about who is allowed to draw.
 */

// ── validation ────────────────────────────────────────────────────
//
// Strict about *shape* and deliberately loose about *magnitude*.
//
// Shape is what has to hold: the right fields, the right types, a `type` that
// is one of five known things, and array lengths that keep one payload from
// writing a document Mongo would refuse anyway. That is what protects the
// database and the renderer, and it is checked properly below.
//
// Magnitude is a different matter. The studio's properties panel applies
// whatever number you type, with no clamp — type 0 into a wall's thickness and
// the wall becomes 0 thick. Tightening these bounds to what a sensible building
// looks like would mean the server rejecting a drawing the tool itself allowed,
// and the only thing the architect would see for it is "Autosave failed" with
// no way to find the offending field. A silly wall is the user's problem; a
// save that cannot succeed is ours. So the limits here are set where numbers
// stop being numbers, not where they stop being good architecture.
const coord = z.number().finite().min(-1e6).max(1e6);
const point = z.tuple([coord, coord]);
const size = z.number().finite().min(0).max(1e5);
const matName = z.string().max(40);

/**
 * Every field the engine reads defensively is optional here, and that is the
 * whole design rule for these schemas.
 *
 * The studio treats most of an element as "use this if it's there": walls take
 * `w.mat || 'plaster'`, doors take `op.swing === undefined ? 1 : op.swing`,
 * stairs take `el.rail !== false`, columns take `el.shape || 'square'`. Its own
 * sample villa relies on that — the two upstairs windows are written without a
 * hinge, a swing or an open angle, because a window has no use for any of them.
 *
 * A schema that demanded those fields would reject the drawing the tool itself
 * produced, and the architect would see nothing but "Autosave failed". So what
 * is required here is only what a thing needs to *be* that thing: an id, a
 * type, the wall an opening is cut into, the catalogue item a piece of
 * furniture is. Everything else is the studio's business.
 */
const wallEl = z.object({
  id: z.string().max(40),
  type: z.literal("wall"),
  a: point,
  b: point,
  t: size.optional(),
  h: size.optional(),
  mat: matName.optional(),
});

const openingEl = z.object({
  id: z.string().max(40),
  type: z.enum(["door", "window"]),
  host: z.string().max(40),
  off: size.optional(),
  w: size.optional(),
  h: size.optional(),
  sill: size.optional(),
  mat: matName.optional(),
  // Doors only. A window carries none of the three, which is exactly why they
  // cannot be required.
  hinge: z.enum(["left", "right"]).optional(),
  swing: z.number().finite().optional(),
  open: z.number().finite().optional(),
});

const furnitureEl = z.object({
  id: z.string().max(40),
  type: z.literal("furniture"),
  // A catalogue id ("sofa", "bed-king") or a kit model's ("fur/chair",
  // "pro/shape-hollow-cylinder-half-detailed" — the longest of the 693 at 39
  // characters). The room above that is deliberate: a kit id is a filename
  // Kenney chose, so a future kit could ship a longer one, and the cost of
  // being wrong here is an architect staring at "Autosave failed".
  sub: z.string().max(80),
  x: coord.optional(),
  z: coord.optional(),
  rot: z.number().finite().optional(),
  w: size.optional(),
  d: size.optional(),
  h: size.optional(),
  mat: matName.nullable().optional(),
  mountY: size.optional(),
});

const stairsEl = z.object({
  id: z.string().max(40),
  type: z.literal("stairs"),
  x: coord.optional(),
  z: coord.optional(),
  rot: z.number().finite().optional(),
  w: size.optional(),
  rise: size.optional(),
  run: size.optional(),
  mat: matName.optional(),
  rail: z.boolean().optional(),
  // Whether this flight cuts a stairwell opening through the slab above it.
  // Absent counts as yes, so every stair drawn before this existed keeps its
  // opening. This line is not optional housekeeping: a zod object *strips*
  // keys it does not name rather than rejecting them, so without it the
  // studio's toggle would save without complaint and come back missing.
  cut: z.boolean().optional(),
  // Read by the 3D builder but not written by any control yet. Kept so a plan
  // imported from a file that has it survives a round trip.
  railSide: z.enum(["left", "right"]).optional(),
});

const columnEl = z.object({
  id: z.string().max(40),
  type: z.literal("column"),
  x: coord.optional(),
  z: coord.optional(),
  rot: z.number().finite().optional(),
  w: size.optional(),
  d: size.optional(),
  h: size.optional(),
  shape: z.enum(["square", "round"]).optional(),
  mat: matName.optional(),
});

/**
 * Discriminated on `type`, which is what lets zod report "a wall is missing
 * its `b` endpoint" instead of "nothing in this union matched".
 */
const elementSchema = z.discriminatedUnion("type", [
  wallEl,
  openingEl,
  furnitureEl,
  stairsEl,
  columnEl,
]);

const roomMetaSchema = z.object({
  c: point,
  name: z.string().max(200).optional(),
  mat: matName.nullable().optional(),
});

const floorSchema = z.object({
  id: z.string().max(40),
  // Defaulted rather than optional: an absent name would be shown to the
  // architect as "undefined" on the floor chip.
  name: z.string().min(1).max(200).default("Floor"),
  note: z.string().max(500).default(""),
  elevation: coord.default(0),
  height: size.default(9.5),
  visible: z.boolean().default(true),
  floorMat: matName.default("oak"),
  ceilMat: matName.default("plaster"),
  // A generous ceiling rather than a design limit: it stops one runaway paste
  // from writing a document Mongo would reject at 16 MB anyway.
  elements: z.array(elementSchema).max(4000).default([]),
  roomMeta: z.array(roomMetaSchema).max(400).default([]),
});

const designSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.enum(["ft", "m"]),
  floors: z.array(floorSchema).min(1).max(50),
  active: z.number().int().min(0).max(49),
  v: z.number().int().min(1).max(100),
  // Hour of day for the 3D sun. Optional so a design saved before this
  // existed still validates; the studio falls back to its own default.
  sunHour: z.number().min(0).max(24).optional(),
});

const versionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(160),
  at: z.number().int().min(0),
  // A 132x100 JPEG at quality 0.55 is a few kilobytes; 200 KB is room to spare
  // and still refuses an arbitrary file smuggled in as a data URL.
  thumb: z.string().max(200_000),
  design: designSchema,
});

/** The listing shape — everything except the payload. */
function toSummary(v: {
  vid: string;
  label: string;
  at: number;
  thumb: string;
}): StudioVersionSummary {
  return { id: v.vid, label: v.label, at: v.at, thumb: v.thumb };
}

// ── endpoints ─────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/studio — the saved design plus the version list.
 *
 * `design: null` means nothing has been drawn yet, which is what makes the
 * studio open on its sample villa exactly as the standalone tool does.
 */
export async function loadStudioDesign(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const [doc, versions] = await Promise.all([
    StudioDesign.findOne({ project: project._id }),
    StudioVersion.find({ project: project._id })
      .sort({ at: -1 })
      .limit(STUDIO_VERSION_LIMIT)
      .select("vid label at thumb"),
  ]);

  const result: StudioLoadResult = {
    design: doc
      ? {
          name: doc.name,
          unit: doc.unit,
          floors: doc.floors,
          active: doc.active,
          v: doc.v,
          sunHour: doc.sunHour,
        }
      : null,
    versions: versions.map(toSummary),
    canEdit: canEditPlans(project, req.auth!),
  };
  return res.json({ data: result });
}

/**
 * PUT /api/projects/:id/studio — save the whole design.
 *
 * An upsert with the complete building every time. The studio holds all of it
 * in memory and its autosave is debounced to 500 ms, so there is nothing to
 * patch incrementally and a partial write would only create ways for the saved
 * building to disagree with the drawn one.
 */
export async function saveStudioDesign(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (!canEditPlans(project, req.auth!)) {
    return res
      .status(403)
      .json({ error: { message: "Only the project's architect can edit the design" } });
  }

  const parsed = designSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid design",
        details: parsed.error.issues,
      },
    });
  }

  // `active` indexes into `floors`, so a payload can name a level that isn't
  // there. Clamping beats rejecting: the drawing is fine, only the cursor is
  // out of range, and refusing the save would lose real work.
  const design = parsed.data;
  const active = Math.min(design.active, design.floors.length - 1);

  await StudioDesign.findOneAndUpdate(
    { project: project._id },
    { ...design, active, project: project._id, updatedBy: req.auth!.sub },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return res.json({ data: { savedAt: new Date().toISOString() } });
}

/**
 * POST /api/projects/:id/studio/versions — keep a snapshot.
 *
 * The studio caps its history at twelve; the same cap is enforced here rather
 * than trusted from the client, because the client is the thing that might be
 * looping.
 */
export async function saveStudioVersion(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (!canEditPlans(project, req.auth!)) {
    return res
      .status(403)
      .json({ error: { message: "Only the project's architect can save versions" } });
  }

  const parsed = versionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid version",
        details: parsed.error.issues,
      },
    });
  }

  const { id, label, at, thumb, design } = parsed.data;
  await StudioVersion.findOneAndUpdate(
    { project: project._id, vid: id },
    { project: project._id, vid: id, label, at, thumb, design, createdBy: req.auth!.sub },
    { upsert: true, setDefaultsOnInsert: true }
  );

  // Trim the oldest past the cap. Done after the insert so a project never
  // dips below the limit between the two writes.
  const stale = await StudioVersion.find({ project: project._id })
    .sort({ at: -1 })
    .skip(STUDIO_VERSION_LIMIT)
    .select("_id");
  if (stale.length > 0) {
    await StudioVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
  }

  const versions = await StudioVersion.find({ project: project._id })
    .sort({ at: -1 })
    .select("vid label at thumb");
  return res.json({ data: { versions: versions.map(toSummary) } });
}

/** GET /api/projects/:id/studio/versions/:vid — one snapshot's full design. */
export async function getStudioVersion(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canViewPlans(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const doc = await StudioVersion.findOne({ project: project._id, vid: req.params.vid });
  if (!doc) return res.status(404).json({ error: { message: "Version not found" } });

  return res.json({
    data: {
      id: doc.vid,
      label: doc.label,
      at: doc.at,
      thumb: doc.thumb,
      design: doc.design as StudioDesignData,
    },
  });
}
