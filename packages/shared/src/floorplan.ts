import { FurnitureKind, RoomKind, type OpeningKind } from "./enums";
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
  /** Degrees clockwise, 0–359. The editor only ever emits 0, 90, 180 or 270. */
  rotation: number;
  /** Overrides the preset name on the drawing. */
  label?: string;
}

/** A door or window sitting on a wall, `offsetFt` along it from (x1,y1). */
export interface PlanOpening {
  id: string;
  wallId: string;
  offsetFt: number;
  widthFt: number;
  kind: OpeningKind;
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
  /** Snap step in feet — 1 by default, 0.5 for finer work. */
  gridStepFt: number;
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
  gridStepFt: number;
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

/**
 * Standard size of each piece of furniture, in feet, as sold and built here.
 * Placing a piece uses these directly, so a bed on the plan is the size of a
 * real bed and "does it fit" is a question the drawing can actually answer.
 */
export const FURNITURE_PRESETS: Record<
  FurnitureKind,
  { label: string; widthFt: number; depthFt: number }
> = {
  [FurnitureKind.BED_DOUBLE]: { label: "Double bed", widthFt: 5, depthFt: 6.5 },
  [FurnitureKind.BED_SINGLE]: { label: "Single bed", widthFt: 3, depthFt: 6.25 },
  [FurnitureKind.SOFA]: { label: "Sofa", widthFt: 7, depthFt: 2.75 },
  [FurnitureKind.DINING_TABLE]: { label: "Dining table", widthFt: 5, depthFt: 3 },
  [FurnitureKind.WARDROBE]: { label: "Wardrobe", widthFt: 5, depthFt: 2 },
  [FurnitureKind.TV_UNIT]: { label: "TV unit", widthFt: 5, depthFt: 1.5 },
  [FurnitureKind.TOILET]: { label: "Toilet", widthFt: 1.25, depthFt: 2.25 },
  [FurnitureKind.SINK]: { label: "Basin", widthFt: 1.5, depthFt: 1.25 },
  [FurnitureKind.SHOWER]: { label: "Shower", widthFt: 2.5, depthFt: 2.5 },
  [FurnitureKind.BATHTUB]: { label: "Bathtub", widthFt: 2.25, depthFt: 4.5 },
  [FurnitureKind.DESK]: { label: "Study desk", widthFt: 4, depthFt: 2 },
  [FurnitureKind.CHAIR]: { label: "Chair", widthFt: 1.5, depthFt: 1.5 },
};

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
  furniture: PlanFurniture[]
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
