/**
 * The BD Design Studio's project format.
 *
 * These types describe the studio's own model, not Buildora's. The studio was
 * built as a standalone tool with its geometry in **feet** on an (x, z) plan
 * plane — x to the right, z down the page — which maps straight onto the 3D
 * ground plane with no conversion anywhere. Bringing it in meant a choice
 * between rewriting its geometry into `PlanWall`/`PlanRoom` or storing what it
 * already holds, and rewriting it is precisely what would change the tool.
 *
 * So the studio saves its own shape, and a separate step *mirrors* the rooms
 * it detects into the `FloorPlan` collection, which is what the FAR check, the
 * cost estimate and the Bill of Quantities read. The studio is the drawing;
 * `FloorPlan` stays the platform's measurement of it.
 *
 * @see apps/web/src/lib/studioToFloorPlan.ts for the mirror
 */

/** A point on the plan: `[x, z]` in feet. Never `{x, y}` — the studio is 3D. */
export type StudioPoint = [number, number];

/**
 * A wall segment.
 *
 * Everything but the id and the two endpoints is optional, here and in every
 * type below, because that is how the studio actually reads them — `w.mat ||
 * "plaster"`, `w.h || floor.height`. Declaring them required would be a claim
 * the drawing does not make.
 */
export interface StudioWall {
  id: string;
  type: "wall";
  a: StudioPoint;
  b: StudioPoint;
  /** Thickness in **feet** — 0.42 is a 5" partition. Absent means the default. */
  t?: number;
  /** Height in feet. Set per wall so a parapet can be shorter than the floor. */
  h?: number;
  mat?: string;
}

/**
 * A hole cut into a wall. `host` is the wall's id and `off` is the distance in
 * feet from the wall's `a` end to the centre of the opening.
 */
export interface StudioOpening {
  id: string;
  type: "door" | "window";
  host: string;
  off?: number;
  w?: number;
  h?: number;
  /** Height of the sill above the floor. Doors are 0. */
  sill?: number;
  mat?: string;
  /** Doors only — a window carries none of these three. Absent means "left". */
  hinge?: "left" | "right";
  /** Which way the leaf swings: 1 or -1. Absent means 1. */
  swing?: number;
  /** How far the leaf stands open, 0–1. Absent means 0.55. */
  open?: number;
}

/** A catalogue item placed on the floor. `x, z` is its centre. */
export interface StudioFurniture {
  id: string;
  type: "furniture";
  /** Catalogue id — "bed-king", "sofa-l", "island"… */
  sub: string;
  x?: number;
  z?: number;
  /** Rotation about its own centre, in radians. */
  rot?: number;
  w?: number;
  d?: number;
  h?: number;
  mat?: string | null;
  /** Height off the floor, for things that hang — a split AC sits at 7.2 ft. */
  mountY?: number;
}

/** A stair run. `rise` is the floor-to-floor climb, `run` the horizontal go. */
export interface StudioStairs {
  id: string;
  type: "stairs";
  x?: number;
  z?: number;
  rot?: number;
  w?: number;
  rise?: number;
  run?: number;
  mat?: string;
  /** Absent counts as railed — the 3D builder tests `rail !== false`. */
  rail?: boolean;
  /** Which side carries the rail. Read by the 3D builder, not yet written. */
  railSide?: "left" | "right";
}

/** A structural column. */
export interface StudioColumn {
  id: string;
  type: "column";
  x?: number;
  z?: number;
  rot?: number;
  w?: number;
  d?: number;
  h?: number;
  /** Absent means square. */
  shape?: "square" | "round";
  mat?: string;
}

export type StudioElement =
  StudioWall | StudioOpening | StudioFurniture | StudioStairs | StudioColumn;

/**
 * A name and finish for one room.
 *
 * Rooms are not stored: the studio *derives* them by walking the wall graph
 * every time the walls change, so a room has no id to hang a name on. `c` is
 * the room's centroid when it was last named, and a detected room reclaims its
 * metadata by finding the nearest centroid — which survives the room being
 * resized or its walls being nudged.
 */
export interface StudioRoomMeta {
  c: StudioPoint;
  name?: string;
  /** Absent falls back to the floor's own finish. */
  mat?: string | null;
}

/** One level of the building. */
export interface StudioFloor {
  id: string;
  name: string;
  note: string;
  /** Height of this floor's slab above ground, in feet. */
  elevation: number;
  /** Floor-to-ceiling height in feet — the default for walls drawn on it. */
  height: number;
  visible: boolean;
  floorMat: string;
  ceilMat: string;
  elements: StudioElement[];
  roomMeta: StudioRoomMeta[];
}

/** A whole studio project — what the editor holds and what gets saved. */
export interface StudioDesign {
  name: string;
  /** Display unit only; the geometry above is always feet. */
  unit: "ft" | "m";
  floors: StudioFloor[];
  /** Index into `floors` of the level being edited. */
  active: number;
  /** Format version, for future migrations. */
  v: number;
}

/** A saved snapshot, listed in the studio's Layers tab. */
export interface StudioVersionSummary {
  id: string;
  label: string;
  /** Epoch milliseconds. */
  at: number;
  /** A 132x100 JPEG data URL of the 2D plan. */
  thumb: string;
}

/** A snapshot with its payload — fetched only when one is opened. */
export interface StudioVersion extends StudioVersionSummary {
  design: StudioDesign;
}

/** What one load of the studio needs. */
export interface StudioLoadResult {
  /** Null when nothing has been drawn yet, which starts the sample villa. */
  design: StudioDesign | null;
  versions: StudioVersionSummary[];
  /** True for the project's architect (and admins); everyone else reads only. */
  canEdit: boolean;
}

/** How many snapshots a project keeps. The oldest fall off the end. */
export const STUDIO_VERSION_LIMIT = 12;
