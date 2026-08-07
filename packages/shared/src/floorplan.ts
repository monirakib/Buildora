import type { OpeningKind } from "./enums";
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
