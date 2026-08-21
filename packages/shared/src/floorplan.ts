import {
  FurnitureKind,
  OpeningKind,
  PlanMaterial,
  RoomKind,
  type ColumnShape,
  type DoorSwing,
  type HingeSide,
  type StairRailSide,
} from "./enums";
import type { UserRef } from "./types";

/**
 * The 2D floor plan a project's architect draws before any 3D model exists.
 *
 * Everything here is plain geometry in **feet**, measured from a top-left
 * origin with y growing downwards — the same axes SVG uses, so the editor can
 * render a wall by dropping its numbers straight into a <line> with no
 * coordinate flipping. Feet (not metres) because that is how plots, road
 * widths, and room sizes are actually quoted on site in Bangladesh.
 *
 * One document per floor: see `level`.
 */

/** One point on the plan, in feet from the top-left origin. */
export interface PlanPoint {
  x: number;
  y: number;
}

/**
 * A single wall segment. Thickness is in **inches** because that is how walls
 * are specified here — a 5" partition wall, a 10" exterior wall — while
 * lengths are in feet.
 */
export interface PlanWall {
  /** Stable id generated in the editor; openings point at it. */
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessIn: number;
  /**
   * How tall this wall stands, in feet. Absent means "whatever the floor's
   * ceiling height is" — which is what almost every wall wants. It is set only
   * for the odd one out: a waist-high balcony parapet, a half-height divider.
   */
  heightFt?: number;
  /** 3D surface finish. Absent falls back to plaster. */
  material?: PlanMaterial;
}

/** A named enclosed space, drawn as a polygon. Its area drives the FAR check. */
export interface PlanRoom {
  id: string;
  name: string;
  /** Polygon corners in order. At least 3. */
  points: PlanPoint[];
  /** What the room is for. Absent on plans drawn before room types existed. */
  kind?: RoomKind;
  /** `#rrggbb` override for the room's tint; falls back to the kind's colour. */
  color?: string;
  /** 3D floor finish for this room; falls back to the floor's default. */
  floorMaterial?: PlanMaterial;
  /** 3D ceiling finish for this room; falls back to the floor's default. */
  ceilingMaterial?: PlanMaterial;
}

/**
 * A piece of furniture sitting on a floor. `x, y` is the top-left corner of its
 * **unrotated** box, in feet, and `rotation` turns it about its own centre —
 * which is exactly what an SVG `rotate(deg cx cy)` transform does, so placing
 * one needs no corner trigonometry anywhere.
 */
export interface PlanFurniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  /** Across the piece, before rotation. */
  widthFt: number;
  /** Front-to-back, before rotation. */
  depthFt: number;
  /**
   * Degrees clockwise, 0–359. The 2D toolbar button still turns in 90° steps;
   * the 3D rotate ring and the properties slider emit any whole degree.
   */
  rotation: number;
  /** Overrides the preset name on the drawing. */
  label?: string;
  /** How tall the piece is. Absent falls back to the preset's height. */
  heightFt?: number;
  /**
   * Height of the piece's underside above the floor, in feet. Only wall-mounted
   * things use it — a split AC sits at 7'2", a wall TV around 4'. Absent means
   * it stands on the floor.
   */
  mountFt?: number;
  /** 3D finish override; absent falls back to the preset's own material. */
  material?: PlanMaterial;
}

/** A door or window sitting on a wall, `offsetFt` along it from (x1,y1). */
export interface PlanOpening {
  id: string;
  wallId: string;
  offsetFt: number;
  widthFt: number;
  kind: OpeningKind;
  /** Height of the hole itself. Absent uses the door/window default. */
  heightFt?: number;
  /** Height of the bottom of the hole above the floor. Doors are 0. */
  sillFt?: number;
  /** Which jamb the leaf hangs from. Doors only. */
  hinge?: HingeSide;
  /** Which way the leaf swings. Doors only. */
  swing?: DoorSwing;
  /** How far the leaf stands open on the drawing and in 3D, 0–120°. */
  openDeg?: number;
  /** Finish for the frame and leaf; windows default to metal, doors to wood. */
  frameMaterial?: PlanMaterial;
}

/**
 * A stair run. `x, y` is the top-left corner of its **unrotated** footprint,
 * matching how furniture is placed, so the same drag and rotate code moves both.
 *
 * The number of risers is never stored — it is worked out from the rise every
 * time (see `stairRiserCount`). Storing it would mean a second number that can
 * drift out of step with the floor height it is supposed to follow.
 */
export interface PlanStair {
  id: string;
  x: number;
  y: number;
  /** Across the run. */
  widthFt: number;
  /** Along the run, in the direction of travel. */
  runFt: number;
  /** Degrees clockwise, 0–359 — same convention as furniture. */
  rotation: number;
  /** Total height climbed. Absent means "this floor's floor-to-floor height". */
  riseFt?: number;
  railSide?: StairRailSide;
  material?: PlanMaterial;
}

/** A structural column. `x, y` is its **centre**, unlike furniture. */
export interface PlanColumn {
  id: string;
  x: number;
  y: number;
  /** Side of the square, or the diameter of a round one. */
  sizeFt: number;
  shape?: ColumnShape;
  /** Absent means it runs the full ceiling height. */
  heightFt?: number;
  material?: PlanMaterial;
}

/** One floor's plan. `level` 0 is the ground floor, 1 the first floor, … */
export interface FloorPlan {
  id: string;
  projectId: string;
  level: number;
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
  stairs: PlanStair[];
  columns: PlanColumn[];
  /** Snap step in feet — 1 by default, 0.5 for finer work. */
  gridStepFt: number;
  /** Floor-to-ceiling height for this level, in feet. */
  ceilingHeightFt: number;
  /** Structural slab between this level and the one above. */
  slabThicknessFt: number;
  /** Default 3D floor finish for rooms that don't name their own. */
  floorMaterial?: PlanMaterial;
  /** Default 3D ceiling finish. */
  ceilingMaterial?: PlanMaterial;
  /** Draw the ceiling slab in 3D. Off by default — it seals the room. */
  showCeiling: boolean;
  /** Who last saved this floor. */
  updatedBy?: UserRef;
  createdAt: string;
  updatedAt: string;
}

/** What the editor sends when saving; ids and timestamps are server-side. */
export interface FloorPlanInput {
  level: number;
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
  stairs: PlanStair[];
  columns: PlanColumn[];
  gridStepFt: number;
  ceilingHeightFt: number;
  slabThicknessFt: number;
  floorMaterial?: PlanMaterial;
  ceilingMaterial?: PlanMaterial;
  showCeiling: boolean;
}

/**
 * The result of checking a project's drawn floors against the DAP zone rules
 * already stored in the database. Nothing here is hardcoded — the limits come
 * from the admin-editable DapZone record matched on the project's area.
 */
export interface PlanCompliance {
  /** Plot size from the brief's `landAreaKatha`, converted to sq ft. */
  plotAreaSqft: number;
  /** Level 0's room area — what the building covers on the ground. */
  groundFloorAreaSqft: number;
  /** Room area summed across every floor that has been drawn. */
  totalBuiltAreaSqft: number;
  /** totalBuiltAreaSqft / plotAreaSqft. */
  far: number;
  /** groundFloorAreaSqft / plotAreaSqft, as a percentage. */
  groundCoveragePct: number;
  /** How many floors actually have rooms drawn on them. */
  floorsDrawn: number;
  /** The matched zone's limits, absent when no zone covers this area. */
  zoneCode?: string;
  maxFar?: number;
  maxGroundCoveragePct?: number;
  maxFloors?: number;
  /** OK, over a limit, or no zone record to check against. */
  verdict: "ok" | "over" | "no-zone";
  /** Human-readable reasons, empty when the verdict is "ok". */
  issues: string[];
}

/** What each room type is called in the editor and in advice text. */
export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  [RoomKind.BEDROOM]: "Bedroom",
  [RoomKind.LIVING]: "Living room",
  [RoomKind.KITCHEN]: "Kitchen",
  [RoomKind.BATHROOM]: "Bathroom",
  [RoomKind.DINING]: "Dining room",
  [RoomKind.BALCONY]: "Balcony",
  [RoomKind.CORRIDOR]: "Corridor",
  [RoomKind.STORE]: "Store room",
  [RoomKind.OTHER]: "Room",
};

/**
 * The tint each room type gets on the drawing. Muted, mid-tone hues: they are
 * painted at low opacity over the paper, so they have to stay legible against
 * both the light and the dark sheet without a second palette.
 */
export const ROOM_KIND_COLORS: Record<RoomKind, string> = {
  [RoomKind.BEDROOM]: "#4a6fa5",
  [RoomKind.LIVING]: "#2e7d5e",
  [RoomKind.KITCHEN]: "#a0522d",
  [RoomKind.BATHROOM]: "#6a5acd",
  [RoomKind.DINING]: "#4a7c59",
  [RoomKind.BALCONY]: "#2980b9",
  [RoomKind.CORRIDOR]: "#7f8c8d",
  [RoomKind.STORE]: "#8d6e63",
  [RoomKind.OTHER]: "#d97706",
};

/** What the library panel files a piece of furniture under. */
export type FurnitureGroup =
  "Bedroom" | "Living" | "Dining" | "Kitchen" | "Bath" | "Work" | "Fittings";

export interface FurniturePreset {
  label: string;
  group: FurnitureGroup;
  widthFt: number;
  depthFt: number;
  /** Standing height. Only the 3D view uses it; the plan is a top-down drawing. */
  heightFt: number;
  /** Set only on wall-mounted pieces — see `PlanFurniture.mountFt`. */
  mountFt?: number;
  /** The finish this piece is made of unless the architect overrides it. */
  material?: PlanMaterial;
}

/**
 * Standard size of each piece of furniture, in feet, as sold and built here.
 * Placing a piece uses these directly, so a bed on the plan is the size of a
 * real bed and "does it fit" is a question the drawing can actually answer.
 */
export const FURNITURE_PRESETS: Record<FurnitureKind, FurniturePreset> = {
  // Bedroom
  [FurnitureKind.BED_DOUBLE]: {
    label: "Double bed",
    group: "Bedroom",
    widthFt: 5,
    depthFt: 6.5,
    heightFt: 2.3,
  },
  [FurnitureKind.BED_SINGLE]: {
    label: "Single bed",
    group: "Bedroom",
    widthFt: 3,
    depthFt: 6.25,
    heightFt: 2.3,
  },
  [FurnitureKind.WARDROBE]: {
    label: "Wardrobe",
    group: "Bedroom",
    widthFt: 5,
    depthFt: 2,
    heightFt: 7,
  },
  [FurnitureKind.NIGHTSTAND]: {
    label: "Nightstand",
    group: "Bedroom",
    widthFt: 1.6,
    depthFt: 1.4,
    heightFt: 2,
  },
  // Living
  [FurnitureKind.SOFA]: {
    label: "Sofa",
    group: "Living",
    widthFt: 7,
    depthFt: 2.75,
    heightFt: 2.6,
    material: PlanMaterial.FABRIC_GREY,
  },
  [FurnitureKind.SECTIONAL_SOFA]: {
    label: "L-sectional",
    group: "Living",
    widthFt: 8.5,
    depthFt: 6,
    heightFt: 2.6,
    material: PlanMaterial.FABRIC_GREY,
  },
  [FurnitureKind.ARMCHAIR]: {
    label: "Armchair",
    group: "Living",
    widthFt: 2.8,
    depthFt: 2.8,
    heightFt: 2.6,
    material: PlanMaterial.FABRIC_BEIGE,
  },
  [FurnitureKind.COFFEE_TABLE]: {
    label: "Coffee table",
    group: "Living",
    widthFt: 3.6,
    depthFt: 2,
    heightFt: 1.35,
  },
  [FurnitureKind.TV_UNIT]: {
    label: "TV unit",
    group: "Living",
    widthFt: 5,
    depthFt: 1.5,
    heightFt: 1.7,
  },
  [FurnitureKind.AREA_RUG]: {
    label: "Area rug",
    group: "Living",
    widthFt: 8,
    depthFt: 5.5,
    heightFt: 0.06,
    material: PlanMaterial.FABRIC_BEIGE,
  },
  // Dining
  [FurnitureKind.DINING_TABLE]: {
    label: "Dining table",
    group: "Dining",
    widthFt: 5,
    depthFt: 3,
    heightFt: 2.5,
  },
  [FurnitureKind.CHAIR]: {
    label: "Chair",
    group: "Dining",
    widthFt: 1.5,
    depthFt: 1.5,
    heightFt: 3,
  },
  // Kitchen
  [FurnitureKind.KITCHEN_ISLAND]: {
    label: "Kitchen island",
    group: "Kitchen",
    widthFt: 6,
    depthFt: 3,
    heightFt: 3,
  },
  [FurnitureKind.COUNTER_RUN]: {
    label: "Counter run",
    group: "Kitchen",
    widthFt: 8,
    depthFt: 2,
    heightFt: 3,
  },
  [FurnitureKind.REFRIGERATOR]: {
    label: "Refrigerator",
    group: "Kitchen",
    widthFt: 2.5,
    depthFt: 2.4,
    heightFt: 6,
    material: PlanMaterial.BRUSHED_STEEL,
  },
  // Bath
  [FurnitureKind.TOILET]: {
    label: "Toilet",
    group: "Bath",
    widthFt: 1.25,
    depthFt: 2.25,
    heightFt: 2.5,
  },
  [FurnitureKind.SINK]: {
    label: "Basin",
    group: "Bath",
    widthFt: 1.5,
    depthFt: 1.25,
    heightFt: 2.8,
  },
  [FurnitureKind.SHOWER]: {
    label: "Shower",
    group: "Bath",
    widthFt: 2.5,
    depthFt: 2.5,
    heightFt: 6.8,
  },
  [FurnitureKind.BATHTUB]: {
    label: "Bathtub",
    group: "Bath",
    widthFt: 2.25,
    depthFt: 4.5,
    heightFt: 1.8,
  },
  // Work
  [FurnitureKind.DESK]: {
    label: "Study desk",
    group: "Work",
    widthFt: 4,
    depthFt: 2,
    heightFt: 2.5,
  },
  [FurnitureKind.BOOKSHELF]: {
    label: "Bookshelf",
    group: "Work",
    widthFt: 3,
    depthFt: 1.2,
    heightFt: 6,
  },
  // Fittings
  [FurnitureKind.PLANTER]: {
    label: "Planter",
    group: "Fittings",
    widthFt: 1.8,
    depthFt: 1.8,
    heightFt: 4.5,
  },
  // Mounted high on the wall, the way every Dhaka split unit is.
  [FurnitureKind.SPLIT_AC]: {
    label: "Split AC",
    group: "Fittings",
    widthFt: 3,
    depthFt: 0.8,
    heightFt: 1.1,
    mountFt: 7.2,
  },
};

/** The order the library panel lists its groups in. */
export const FURNITURE_GROUPS: FurnitureGroup[] = [
  "Bedroom",
  "Living",
  "Dining",
  "Kitchen",
  "Bath",
  "Work",
  "Fittings",
];

/** What a piece of furniture is called on the drawing. */
export function furnitureLabel(item: PlanFurniture): string {
  return item.label ?? FURNITURE_PRESETS[item.kind].label;
}

/** 1 katha = 720 sq ft — the standard Dhaka conversion. */
export const KATHA_TO_SQFT = 720;

/** Plot size as the brief records it (katha) turned into plan units (sq ft). */
export function kathaToSqft(katha: number): number {
  return katha * KATHA_TO_SQFT;
}

/**
 * Area of a polygon by the shoelace formula: walk the corners in order,
 * accumulate the cross product of each consecutive pair, halve the absolute
 * total. The absolute value is what makes winding direction irrelevant, so a
 * room drawn clockwise measures the same as one drawn anticlockwise.
 */
export function polygonAreaSqft(points: PlanPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!; // last corner wraps to the first
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Total enclosed area of one floor — every room polygon added up. */
export function floorAreaSqft(rooms: PlanRoom[]): number {
  return rooms.reduce((total, room) => total + polygonAreaSqft(room.points), 0);
}

/** Straight-line length of a wall, in feet. */
export function wallLengthFt(wall: PlanWall): number {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

/** Comparing feet after arithmetic — 1/8" of slack absorbs float drift. */
const SAME_FT = 0.01;

/**
 * A room's width and height, but only when the room really is a rectangle
 * standing square to the sheet: exactly four corners, each edge either
 * horizontal or vertical. Anything else returns null, which is how the editor
 * knows not to offer "type a width" for a shape that has no single width.
 *
 * Every room the room tool draws is such a rectangle, so in practice this
 * returns a size for almost everything.
 */
export function rectFromPoints(
  points: PlanPoint[]
): { x: number; y: number; widthFt: number; heightFt: number } | null {
  if (points.length !== 4) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const widthFt = Math.max(...xs) - x;
  const heightFt = Math.max(...ys) - y;
  if (widthFt < SAME_FT || heightFt < SAME_FT) return null;

  // Each corner must sit on a corner of that bounding box, and consecutive
  // corners must share an x or a y — otherwise it is a quadrilateral that
  // merely fits inside a box, like a diamond.
  for (let i = 0; i < 4; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % 4]!;
    if (Math.abs(a.x - x) > SAME_FT && Math.abs(a.x - x - widthFt) > SAME_FT) return null;
    if (Math.abs(a.y - y) > SAME_FT && Math.abs(a.y - y - heightFt) > SAME_FT) return null;
    if (Math.abs(a.x - b.x) > SAME_FT && Math.abs(a.y - b.y) > SAME_FT) return null;
  }

  return { x, y, widthFt, heightFt };
}

/** The four corners of an axis-aligned room, clockwise from the top-left. */
export function rectRoomPoints(
  x: number,
  y: number,
  widthFt: number,
  heightFt: number
): PlanPoint[] {
  return [
    { x, y },
    { x: x + widthFt, y },
    { x: x + widthFt, y: y + heightFt },
    { x, y: y + heightFt },
  ];
}

/** Shift a polygon by a distance in feet — how a room is dragged. */
export function translatePoints(points: PlanPoint[], dx: number, dy: number): PlanPoint[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * The rectangle everything drawn on a floor fits inside, in feet, or null when
 * the floor is empty.
 *
 * Drawing is not fenced into a fixed sheet, so this is what "the drawing" means
 * for anything that has to frame it: fitting the view to the plan, and choosing
 * how much of the world the PNG export covers.
 */
export function planBounds(
  walls: PlanWall[],
  rooms: PlanRoom[],
  furniture: PlanFurniture[],
  stairs: PlanStair[] = [],
  columns: PlanColumn[] = []
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function grow(x: number, y: number) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  for (const wall of walls) {
    grow(wall.x1, wall.y1);
    grow(wall.x2, wall.y2);
  }
  for (const room of rooms) {
    for (const point of room.points) grow(point.x, point.y);
  }
  for (const item of furniture) {
    // Turning a piece sweeps it out to its longest side in both directions, so
    // take the square around its centre. Slightly generous, never too small,
    // and it avoids rotating four corners for a number only used for framing.
    const cx = item.x + item.widthFt / 2;
    const cy = item.y + item.depthFt / 2;
    const half = Math.max(item.widthFt, item.depthFt) / 2;
    grow(cx - half, cy - half);
    grow(cx + half, cy + half);
  }
  for (const stair of stairs) {
    // Same square-around-the-centre trick as furniture, for the same reason.
    const cx = stair.x + stair.widthFt / 2;
    const cy = stair.y + stair.runFt / 2;
    const half = Math.max(stair.widthFt, stair.runFt) / 2;
    grow(cx - half, cy - half);
    grow(cx + half, cy + half);
  }
  for (const column of columns) {
    const half = column.sizeFt / 2; // x, y is the centre for a column
    grow(column.x - half, column.y - half);
    grow(column.x + half, column.y + half);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Round a coordinate onto the nearest grid line, so walls meet cleanly. */
export function snapToGrid(value: number, stepFt: number): number {
  if (stepFt <= 0) return value;
  return Math.round(value / stepFt) * stepFt;
}

/** "Ground floor", "1st floor", "2nd floor", … for a level number. */
export function floorLabel(level: number): string {
  if (level === 0) return "Ground floor";
  const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
  return `${level}${suffix} floor`;
}

/** Feet as a readable dimension label, e.g. 12.5 → `12'-6"`. */
export function formatFeet(feet: number): string {
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  // 11.99 ft rounds to 12 inches — carry it into the feet column.
  if (inches === 12) return `${whole + 1}'-0"`;
  return `${whole}'-${inches}"`;
}

/** 1 foot in metres, for the display-only unit switch. */
export const M_PER_FT = 0.3048;

/** What the status bar shows lengths as. Storage is always feet. */
export type PlanUnit = "ft" | "m";

/**
 * A length for display. Feet keep the feet-and-inches form architects here
 * read; metres get two decimals. Nothing about this reaches the database —
 * the API contract, the FAR check and every saved plan are in feet.
 */
export function formatLength(feet: number, unit: PlanUnit): string {
  return unit === "m" ? `${(feet * M_PER_FT).toFixed(2)} m` : formatFeet(feet);
}

/** An area for display, in the chosen unit. */
export function formatArea(sqft: number, unit: PlanUnit): string {
  return unit === "m"
    ? `${(sqft * M_PER_FT * M_PER_FT).toFixed(1)} m²`
    : `${Math.round(sqft).toLocaleString()} sq ft`;
}

/* ------------------------------------------------------------------ *
 *  3D defaults and finishes
 * ------------------------------------------------------------------ */

/**
 * The heights a Dhaka apartment is actually built to. These are only defaults:
 * every one of them can be overridden per floor, per wall or per opening.
 */
export const DEFAULT_CEILING_FT = 9.5;
export const DEFAULT_SLAB_FT = 0.5;
export const DEFAULT_DOOR_HEIGHT_FT = 7;
export const DEFAULT_WINDOW_HEIGHT_FT = 4;
export const DEFAULT_WINDOW_SILL_FT = 3;
/** A comfortable riser, in feet — 7 inches. Drives the stair step count. */
export const STAIR_RISER_FT = 7 / 12;

/** How a finish is drawn and lit in 3D. */
export interface MaterialSpec {
  label: string;
  /** One-line description under the name in the library. */
  note: string;
  /** Where the library files it, and which pickers offer it. */
  surface: "wall" | "floor" | "object";
  /** Base colour as `#rrggbb`. */
  hex: string;
  /** 0 = mirror, 1 = completely matte. */
  roughness: number;
  metalness: number;
  /** Which procedural texture to draw, or null for a plain colour. */
  texture:
    "plaster" | "concrete" | "wood" | "marble" | "tile" | "brick" | "grass" | "fabric" | null;
  /** Real-world size of one texture repeat, in feet. This is what keeps scale honest. */
  tileFt: number;
  /** Rendered see-through. */
  glass?: boolean;
}

export const MATERIAL_SPECS: Record<PlanMaterial, MaterialSpec> = {
  [PlanMaterial.PLASTER]: {
    label: "White plaster",
    note: "Matte finish",
    surface: "wall",
    hex: "#f4f3f0",
    roughness: 0.94,
    metalness: 0,
    texture: "plaster",
    tileFt: 8,
  },
  [PlanMaterial.WARM_WHITE]: {
    label: "Warm white",
    note: "Interior paint",
    surface: "wall",
    hex: "#efe9df",
    roughness: 0.92,
    metalness: 0,
    texture: "plaster",
    tileFt: 8,
  },
  [PlanMaterial.CONCRETE]: {
    label: "Smooth concrete",
    note: "Light grey",
    surface: "wall",
    hex: "#c9c9c6",
    roughness: 0.86,
    metalness: 0,
    texture: "concrete",
    tileFt: 6,
  },
  [PlanMaterial.BRICK]: {
    label: "Exposed brick",
    note: "Red clay",
    surface: "wall",
    hex: "#a5553c",
    roughness: 0.95,
    metalness: 0,
    texture: "brick",
    tileFt: 4,
  },
  [PlanMaterial.OAK]: {
    label: "Oak natural",
    note: "Engineered wood",
    surface: "floor",
    hex: "#c49a6c",
    roughness: 0.62,
    metalness: 0,
    texture: "wood",
    tileFt: 6,
  },
  [PlanMaterial.WALNUT]: {
    label: "Walnut dark",
    note: "Hardwood",
    surface: "floor",
    hex: "#7d5439",
    roughness: 0.55,
    metalness: 0,
    texture: "wood",
    tileFt: 6,
  },
  [PlanMaterial.MARBLE]: {
    label: "White marble",
    note: "Polished",
    surface: "floor",
    hex: "#eceae6",
    roughness: 0.18,
    metalness: 0,
    texture: "marble",
    tileFt: 8,
  },
  [PlanMaterial.CERAMIC_TILE]: {
    label: "Ceramic tile",
    note: "600×600 grey",
    surface: "floor",
    hex: "#d8d6d2",
    roughness: 0.32,
    metalness: 0,
    texture: "tile",
    tileFt: 4,
  },
  [PlanMaterial.TERRACOTTA]: {
    label: "Terracotta",
    note: "Clay tile",
    surface: "floor",
    hex: "#b5764f",
    roughness: 0.7,
    metalness: 0,
    texture: "tile",
    tileFt: 3,
  },
  [PlanMaterial.GRASS]: {
    label: "Lawn",
    note: "Outdoor turf",
    surface: "floor",
    hex: "#5f8f3e",
    roughness: 0.97,
    metalness: 0,
    texture: "grass",
    tileFt: 5,
  },
  [PlanMaterial.DECK]: {
    label: "Deck timber",
    note: "Outdoor wood",
    surface: "floor",
    hex: "#9c7a51",
    roughness: 0.82,
    metalness: 0,
    texture: "wood",
    tileFt: 5,
  },
  [PlanMaterial.MOSAIC]: {
    label: "Mosaic tile",
    note: "Balcony / bath",
    surface: "floor",
    hex: "#9fb7bd",
    roughness: 0.35,
    metalness: 0,
    texture: "tile",
    tileFt: 2,
  },
  [PlanMaterial.GLASS]: {
    label: "Glass",
    note: "Double glazed",
    surface: "object",
    hex: "#cfe3ee",
    roughness: 0.05,
    metalness: 0,
    texture: null,
    tileFt: 1,
    glass: true,
  },
  [PlanMaterial.MATTE_BLACK]: {
    label: "Matte black",
    note: "Powder-coated",
    surface: "object",
    hex: "#2b2d31",
    roughness: 0.42,
    metalness: 0.75,
    texture: null,
    tileFt: 1,
  },
  [PlanMaterial.BRUSHED_STEEL]: {
    label: "Brushed steel",
    note: "Appliance",
    surface: "object",
    hex: "#b9bec4",
    roughness: 0.3,
    metalness: 0.9,
    texture: null,
    tileFt: 1,
  },
  [PlanMaterial.FABRIC_GREY]: {
    label: "Charcoal weave",
    note: "Upholstery",
    surface: "object",
    hex: "#5c6067",
    roughness: 0.98,
    metalness: 0,
    texture: "fabric",
    tileFt: 3,
  },
  [PlanMaterial.FABRIC_BEIGE]: {
    label: "Bouclé beige",
    note: "Upholstery",
    surface: "object",
    hex: "#d9d1c3",
    roughness: 0.98,
    metalness: 0,
    texture: "fabric",
    tileFt: 3,
  },
  [PlanMaterial.OAK_FURNITURE]: {
    label: "Oak furniture",
    note: "Solid timber",
    surface: "object",
    hex: "#b5854f",
    roughness: 0.6,
    metalness: 0,
    texture: "wood",
    tileFt: 3,
  },
};

/** The finishes offered for one kind of surface, in library order. */
export function materialsFor(surface: MaterialSpec["surface"]): PlanMaterial[] {
  return (Object.keys(MATERIAL_SPECS) as PlanMaterial[]).filter(
    (id) => MATERIAL_SPECS[id].surface === surface
  );
}

/* ------------------------------------------------------------------ *
 *  Geometry the 3D view needs
 * ------------------------------------------------------------------ */

/**
 * How high above the ground this level's floor sits.
 *
 * Derived by adding up the levels underneath rather than stored, so it can
 * never disagree with the ceiling heights it is supposed to follow. Change a
 * ground-floor ceiling from 9'6" to 11' and every level above it rises.
 */
export function floorElevationFt(
  floors: Record<number, { ceilingHeightFt?: number; slabThicknessFt?: number } | undefined>,
  level: number
): number {
  let elevation = 0;
  for (let below = 0; below < level; below++) {
    const floor = floors[below];
    elevation +=
      (floor?.ceilingHeightFt ?? DEFAULT_CEILING_FT) + (floor?.slabThicknessFt ?? DEFAULT_SLAB_FT);
  }
  return elevation;
}

/** How many steps a run of this height needs, at a comfortable riser. */
export function stairRiserCount(riseFt: number): number {
  return Math.max(2, Math.round(riseFt / STAIR_RISER_FT));
}

/** The head height of an opening — where the lintel starts. */
export function openingHeadFt(opening: PlanOpening): number {
  return openingSillFt(opening) + openingHeightFt(opening);
}

/** An opening's height, falling back to the default for its kind. */
export function openingHeightFt(opening: PlanOpening): number {
  if (opening.heightFt !== undefined) return opening.heightFt;
  return opening.kind === OpeningKind.DOOR ? DEFAULT_DOOR_HEIGHT_FT : DEFAULT_WINDOW_HEIGHT_FT;
}

/** How far an opening's bottom edge sits above the floor. Doors sit on it. */
export function openingSillFt(opening: PlanOpening): number {
  if (opening.sillFt !== undefined) return opening.sillFt;
  return opening.kind === OpeningKind.DOOR ? 0 : DEFAULT_WINDOW_SILL_FT;
}

/** One unbroken stretch of wall, measured along it from the start point. */
export interface WallSpan {
  startFt: number;
  endFt: number;
}

/** A hole in a wall, with the masonry above and below it already worked out. */
export interface WallHole {
  opening: PlanOpening;
  startFt: number;
  endFt: number;
  /** Masonry under the opening — zero for a door. */
  sillFt: number;
  /** Top of the opening; the lintel fills from here to the wall head. */
  headFt: number;
}

/**
 * Split a wall into the solid stretches between its openings, plus the openings
 * themselves. This is what turns a door from a symbol painted on a wall into an
 * actual hole you can walk through in 3D: each solid stretch becomes its own
 * box, and each hole contributes a low box under the sill and a lintel above.
 *
 * Pure, and deliberately in the shared package rather than in the 3D code — the
 * 2D canvas draws exactly the same spans.
 */
export function wallSegmentsAroundOpenings(
  wall: PlanWall,
  openings: PlanOpening[],
  wallHeightFt: number
): { solid: WallSpan[]; holes: WallHole[] } {
  const lengthFt = wallLengthFt(wall);
  const holes: WallHole[] = [];

  for (const opening of openings) {
    if (opening.wallId !== wall.id) continue;
    const startFt = Math.max(0, Math.min(opening.offsetFt, lengthFt));
    const endFt = Math.max(startFt, Math.min(opening.offsetFt + opening.widthFt, lengthFt));
    if (endFt - startFt < 0.02) continue; // clipped away entirely
    holes.push({
      opening,
      startFt,
      endFt,
      sillFt: Math.min(openingSillFt(opening), wallHeightFt),
      headFt: Math.min(openingHeadFt(opening), wallHeightFt),
    });
  }
  holes.sort((a, b) => a.startFt - b.startFt);

  // Walk along the wall, emitting whatever masonry is left between the holes.
  const solid: WallSpan[] = [];
  let cursor = 0;
  for (const hole of holes) {
    if (hole.startFt - cursor > 0.02) solid.push({ startFt: cursor, endFt: hole.startFt });
    cursor = Math.max(cursor, hole.endFt);
  }
  if (lengthFt - cursor > 0.02) solid.push({ startFt: cursor, endFt: lengthFt });

  return { solid, holes };
}

/** Below this, an opening is too narrow to be worth keeping. */
export const MIN_OPENING_FT = 0.5;

/**
 * Pull a wall's openings back inside it after the wall has been resized.
 *
 * Openings are stored as a distance *along* their wall, so shortening one can
 * push a door off the end — and the API rejects a plan where that has happened.
 * Rather than let a save fail on something the editor caused: slide an opening
 * in if it hangs over, narrow it if it no longer fits, drop it if there is no
 * longer a wall wide enough to hold anything.
 */
export function clampOpeningsToWall(
  openings: PlanOpening[],
  wallId: string,
  lengthFt: number
): PlanOpening[] {
  return openings.flatMap((opening) => {
    if (opening.wallId !== wallId) return [opening];
    if (lengthFt < MIN_OPENING_FT) return [];
    const widthFt = Math.min(opening.widthFt, lengthFt);
    return [
      {
        ...opening,
        widthFt: roundFt(widthFt),
        offsetFt: roundFt(Math.max(0, Math.min(opening.offsetFt, lengthFt - widthFt))),
      },
    ];
  });
}

/** Feet to the nearest thousandth — about 1/64", past any float drift. */
export function roundFt(feet: number): number {
  return Math.round(feet * 1000) / 1000;
}
