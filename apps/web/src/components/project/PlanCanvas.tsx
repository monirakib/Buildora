"use client";

import { useId, useState } from "react";
import {
  OpeningKind,
  formatFeet,
  polygonAreaSqft,
  snapToGrid,
  wallLengthFt,
  type PlanOpening,
  type PlanPoint,
  type PlanRoom,
  type PlanWall,
} from "@buildora/shared";

/**
 * The drawing surface of the 2D floor-plan builder.
 *
 * It is one SVG whose **viewBox is measured in feet** — `viewBox="0 0 60 45"`
 * is a sixty-by-forty-five-foot sheet. That single decision removes every
 * pixels-to-feet conversion from the rest of the file: a 10-inch wall is a line
 * with `stroke-width={10/12}`, a room is a polygon of foot coordinates, and the
 * browser handles scaling the sheet into whatever space the card gives it.
 *
 * Drawing is click-click, not click-drag, because that works identically with a
 * mouse and a finger: first click sets a point, second click completes the
 * shape. Every point is snapped to the grid on the way in, so walls meet
 * exactly instead of almost.
 */

export type PlanTool = "select" | "wall" | "room" | "door" | "window";

/** How close (in feet) a click must be to a wall to land a door or window on it. */
const OPENING_SNAP_FT = 2.5;

/** Pointer position in feet, from its position on the screen. */
function toPlanPoint(svg: SVGSVGElement, clientX: number, clientY: number): PlanPoint | null {
  const screenToSvg = svg.getScreenCTM();
  if (!screenToSvg) return null;
  const local = new DOMPoint(clientX, clientY).matrixTransform(screenToSvg.inverse());
  return { x: local.x, y: local.y };
}

/**
 * With "ortho" on, force the segment onto the horizontal or vertical — whichever
 * the pointer is further along. It is how walls are drawn in practice, and it
 * saves fighting the grid for a perfectly straight run.
 */
function applyOrtho(from: PlanPoint, to: PlanPoint, ortho: boolean): PlanPoint {
  if (!ortho) return to;
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y };
}

/**
 * Drop a point onto a wall: how far along the wall the nearest spot is (`t`,
 * 0 at the start and 1 at the end) and how far away the point was. The dot
 * product projects the click onto the wall's direction; clamping `t` to 0…1
 * keeps the result on the segment rather than the infinite line through it.
 */
function projectOntoWall(p: PlanPoint, wall: PlanWall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { t: 0, distance: Math.hypot(p.x - wall.x1, p.y - wall.y1) };
  }
  const raw = ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  const distance = Math.hypot(p.x - (wall.x1 + t * dx), p.y - (wall.y1 + t * dy));
  return { t, distance };
}

/** Unit vector along a wall, plus the perpendicular used to offset symbols. */
function wallAxes(wall: PlanWall) {
  const length = wallLengthFt(wall) || 1;
  const ux = (wall.x2 - wall.x1) / length;
  const uy = (wall.y2 - wall.y1) / length;
  // Rotating (ux, uy) by 90° gives the wall's normal.
  return { length, ux, uy, nx: -uy, ny: ux };
}

/** Average of a polygon's corners — good enough to hang a room label on. */
function centroid(points: PlanPoint[]): PlanPoint {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function PlanCanvas({
  walls,
  rooms,
  openings,
  gridStepFt,
  widthFt,
  heightFt,
  tool,
  ortho,
  readOnly,
  wallThicknessIn,
  openingWidthFt,
  selectedId,
  onSelect,
  onAddWall,
  onAddRoom,
  onAddOpening,
  svgRef,
}: {
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  gridStepFt: number;
  widthFt: number;
  heightFt: number;
  tool: PlanTool;
  ortho: boolean;
  readOnly: boolean;
  wallThicknessIn: number;
  openingWidthFt: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddWall: (wall: PlanWall) => void;
  onAddRoom: (room: PlanRoom) => void;
  onAddOpening: (opening: PlanOpening) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  // The first click of a two-click shape, and where the pointer is now. Both
  // live here rather than in the parent — they are scratch state that vanishes
  // the moment the shape is finished.
  const [draft, setDraft] = useState<PlanPoint | null>(null);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);

  // Pattern ids must be unique on the page: two canvases would otherwise share
  // one grid definition.
  const patternId = useId();
  const minorGrid = `minor-${patternId}`;
  const majorGrid = `major-${patternId}`;

  const wallById = new Map(walls.map((w) => [w.id, w]));

  /** Snap a raw pointer position onto the grid and clamp it to the sheet. */
  function snapped(point: PlanPoint): PlanPoint {
    return {
      x: Math.max(0, Math.min(widthFt, snapToGrid(point.x, gridStepFt))),
      y: Math.max(0, Math.min(heightFt, snapToGrid(point.y, gridStepFt))),
    };
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly || tool === "select") return;
    const raw = toPlanPoint(e.currentTarget, e.clientX, e.clientY);
    if (raw) setCursor(snapped(raw));
  }

  function handleClick(e: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return;
    const raw = toPlanPoint(e.currentTarget, e.clientX, e.clientY);
    if (!raw) return;

    if (tool === "select") {
      onSelect(null); // clicking bare paper clears the selection
      return;
    }

    if (tool === "door" || tool === "window") {
      placeOpening(raw);
      return;
    }

    const point = snapped(raw);

    if (!draft) {
      setDraft(point);
      return;
    }

    if (tool === "wall") {
      const end = applyOrtho(draft, point, ortho);
      // A zero-length wall is a stray double-click, not a wall.
      if (end.x !== draft.x || end.y !== draft.y) {
        onAddWall({
          id: crypto.randomUUID(),
          x1: draft.x,
          y1: draft.y,
          x2: end.x,
          y2: end.y,
          thicknessIn: wallThicknessIn,
        });
        setDraft(end); // chain: the next wall starts where this one ended
      }
      return;
    }

    // Rooms are drawn as a rectangle between two opposite corners.
    if (point.x !== draft.x && point.y !== draft.y) {
      onAddRoom({
        id: crypto.randomUUID(),
        name: `Room ${rooms.length + 1}`,
        points: [
          { x: draft.x, y: draft.y },
          { x: point.x, y: draft.y },
          { x: point.x, y: point.y },
          { x: draft.x, y: point.y },
        ],
      });
    }
    setDraft(null);
  }

  /** Land a door or window on whichever wall the click was nearest. */
  function placeOpening(raw: PlanPoint) {
    let nearest: { wall: PlanWall; t: number; distance: number } | null = null;
    for (const wall of walls) {
      const hit = projectOntoWall(raw, wall);
      if (!nearest || hit.distance < nearest.distance) nearest = { wall, ...hit };
    }
    if (!nearest || nearest.distance > OPENING_SNAP_FT) return;

    const length = wallLengthFt(nearest.wall);
    const width = Math.min(openingWidthFt, length);
    // Centre the opening on the click, then slide it back inside the wall.
    const offsetFt = Math.max(0, Math.min(length - width, nearest.t * length - width / 2));

    onAddOpening({
      id: crypto.randomUUID(),
      wallId: nearest.wall.id,
      offsetFt: Number(offsetFt.toFixed(3)),
      widthFt: Number(width.toFixed(3)),
      kind: tool === "door" ? OpeningKind.DOOR : OpeningKind.WINDOW,
    });
  }

  // Escape abandons a half-drawn shape and ends a wall chain.
  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "Escape") setDraft(null);
  }

  const previewEnd = draft && cursor ? applyOrtho(draft, cursor, tool === "wall" && ortho) : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${widthFt} ${heightFt}`}
      style={{ aspectRatio: `${widthFt} / ${heightFt}` }}
      role="img"
      aria-label="Floor plan drawing canvas"
      tabIndex={0}
      onPointerMove={handleMove}
      onPointerLeave={() => setCursor(null)}
      onPointerUp={handleClick}
      onKeyDown={handleKeyDown}
      // The palette lives in CSS variables so the whole drawing re-themes at
      // once, and the PNG export can override them with print colours.
      className={`w-full touch-none rounded-xl outline-none select-none
        [--plan-paper:#fdfdfc] [--plan-grid:#e7e5e4] [--plan-grid-major:#d6d3d1]
        [--plan-ink:#1c1917] [--plan-room:#f59e0b1a] [--plan-room-line:#d97706]
        [--plan-dim:#78716c] [--plan-accent:#f59e0b]
        dark:[--plan-paper:#0f172a] dark:[--plan-grid:#1e293b] dark:[--plan-grid-major:#334155]
        dark:[--plan-ink:#e2e8f0] dark:[--plan-room:#f59e0b1f] dark:[--plan-room-line:#fbbf24]
        dark:[--plan-dim:#94a3b8]
        ${tool === "select" || readOnly ? "cursor-default" : "cursor-crosshair"}`}
    >
      <defs>
        {/* Minor grid at the snap step, major every 5 ft, nested so one fill draws both. */}
        <pattern
          id={minorGrid}
          width={gridStepFt}
          height={gridStepFt}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridStepFt} 0 L 0 0 0 ${gridStepFt}`}
            fill="none"
            stroke="var(--plan-grid)"
            strokeWidth={0.03}
          />
        </pattern>
        <pattern id={majorGrid} width={5} height={5} patternUnits="userSpaceOnUse">
          <rect width={5} height={5} fill={`url(#${minorGrid})`} />
          <path
            d="M 5 0 L 0 0 0 5"
            fill="none"
            stroke="var(--plan-grid-major)"
            strokeWidth={0.07}
          />
        </pattern>
      </defs>

      <rect width={widthFt} height={heightFt} fill="var(--plan-paper)" />
      <rect width={widthFt} height={heightFt} fill={`url(#${majorGrid})`} />

      {/* Rooms sit under the walls so wall lines read as the room's edges. */}
      {rooms.map((room) => {
        const area = polygonAreaSqft(room.points);
        const label = centroid(room.points);
        const isSelected = room.id === selectedId;
        return (
          <g key={room.id}>
            <polygon
              points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="var(--plan-room)"
              stroke={isSelected ? "var(--plan-accent)" : "var(--plan-room-line)"}
              strokeWidth={isSelected ? 0.18 : 0.08}
              strokeDasharray={isSelected ? undefined : "0.5 0.35"}
              onPointerUp={(e) => {
                if (tool !== "select" || readOnly) return;
                e.stopPropagation();
                onSelect(room.id);
              }}
              style={{ cursor: tool === "select" && !readOnly ? "pointer" : undefined }}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              fontSize={1.3}
              fontWeight={700}
              fill="var(--plan-ink)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              pointerEvents="none"
            >
              {room.name}
            </text>
            <text
              x={label.x}
              y={label.y}
              dy={1.5}
              textAnchor="middle"
              fontSize={1}
              fill="var(--plan-dim)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              pointerEvents="none"
            >
              {Math.round(area)} sq ft
            </text>
          </g>
        );
      })}

      {/* Walls, drawn as thick lines — stroke width *is* the wall thickness. */}
      {walls.map((wall) => (
        <line
          key={wall.id}
          x1={wall.x1}
          y1={wall.y1}
          x2={wall.x2}
          y2={wall.y2}
          stroke={wall.id === selectedId ? "var(--plan-accent)" : "var(--plan-ink)"}
          strokeWidth={wall.thicknessIn / 12}
          strokeLinecap="round"
          onPointerUp={(e) => {
            if (tool !== "select" || readOnly) return;
            e.stopPropagation();
            onSelect(wall.id);
          }}
          style={{ cursor: tool === "select" && !readOnly ? "pointer" : undefined }}
        />
      ))}

      {/* Openings: paint the gap back in paper colour, then add the symbol. */}
      {openings.map((opening) => {
        const wall = wallById.get(opening.wallId);
        if (!wall) return null;
        const { ux, uy, nx, ny } = wallAxes(wall);
        const thickness = wall.thicknessIn / 12;

        const ax = wall.x1 + ux * opening.offsetFt;
        const ay = wall.y1 + uy * opening.offsetFt;
        const bx = wall.x1 + ux * (opening.offsetFt + opening.widthFt);
        const by = wall.y1 + uy * (opening.offsetFt + opening.widthFt);
        const isSelected = opening.id === selectedId;

        return (
          <g
            key={opening.id}
            onPointerUp={(e) => {
              if (tool !== "select" || readOnly) return;
              e.stopPropagation();
              onSelect(opening.id);
            }}
            style={{ cursor: tool === "select" && !readOnly ? "pointer" : undefined }}
          >
            {/* The hole itself — slightly proud of the wall so no ink shows through. */}
            <line
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke="var(--plan-paper)"
              strokeWidth={thickness + 0.04}
            />

            {opening.kind === OpeningKind.DOOR ? (
              // The architectural door symbol: the leaf drawn swung 90° open,
              // and a dashed quarter-arc showing where it sweeps. Both the leaf
              // tip and the far jamb sit one door-width from the hinge at A, so
              // the arc is a quarter circle of that radius centred on the hinge.
              <g
                fill="none"
                stroke={isSelected ? "var(--plan-accent)" : "var(--plan-ink)"}
                strokeWidth={0.09}
              >
                <line
                  x1={ax}
                  y1={ay}
                  x2={ax + nx * opening.widthFt}
                  y2={ay + ny * opening.widthFt}
                />
                <path
                  d={`M ${ax + nx * opening.widthFt} ${ay + ny * opening.widthFt}
                      A ${opening.widthFt} ${opening.widthFt} 0 0 0 ${bx} ${by}`}
                  strokeDasharray="0.4 0.3"
                />
              </g>
            ) : (
              // Window: the two wall faces carried across the gap, plus the pane.
              <g stroke={isSelected ? "var(--plan-accent)" : "var(--plan-ink)"} strokeWidth={0.07}>
                <line
                  x1={ax + (nx * thickness) / 2}
                  y1={ay + (ny * thickness) / 2}
                  x2={bx + (nx * thickness) / 2}
                  y2={by + (ny * thickness) / 2}
                />
                <line
                  x1={ax - (nx * thickness) / 2}
                  y1={ay - (ny * thickness) / 2}
                  x2={bx - (nx * thickness) / 2}
                  y2={by - (ny * thickness) / 2}
                />
                <line x1={ax} y1={ay} x2={bx} y2={by} />
              </g>
            )}
          </g>
        );
      })}

      {/* Dimension labels: each wall's length, rotated to sit along it. */}
      {walls.map((wall) => {
        const length = wallLengthFt(wall);
        if (length < 2) return null; // too short to label without clutter
        const mx = (wall.x1 + wall.x2) / 2;
        const my = (wall.y1 + wall.y2) / 2;
        const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
        // Flip labels that would otherwise read upside down.
        const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
        return (
          <text
            key={`dim-${wall.id}`}
            x={mx}
            y={my}
            dy={-0.45}
            transform={`rotate(${upright} ${mx} ${my})`}
            textAnchor="middle"
            fontSize={0.95}
            fill="var(--plan-dim)"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            pointerEvents="none"
          >
            {formatFeet(length)}
          </text>
        );
      })}

      {/* Live preview of the shape being drawn. `data-transient` marks the bits
          that belong to the act of drawing, so the PNG export can strip them. */}
      {draft && previewEnd && tool === "wall" && (
        <line
          data-transient="true"
          x1={draft.x}
          y1={draft.y}
          x2={previewEnd.x}
          y2={previewEnd.y}
          stroke="var(--plan-accent)"
          strokeWidth={wallThicknessIn / 12}
          strokeLinecap="round"
          opacity={0.55}
          pointerEvents="none"
        />
      )}
      {draft && cursor && tool === "room" && (
        <rect
          data-transient="true"
          x={Math.min(draft.x, cursor.x)}
          y={Math.min(draft.y, cursor.y)}
          width={Math.abs(cursor.x - draft.x)}
          height={Math.abs(cursor.y - draft.y)}
          fill="var(--plan-room)"
          stroke="var(--plan-accent)"
          strokeWidth={0.12}
          strokeDasharray="0.5 0.35"
          pointerEvents="none"
        />
      )}

      {/* The snapped cursor, so it is obvious where the next click will land. */}
      {cursor && !readOnly && tool !== "select" && (
        <circle
          data-transient="true"
          cx={cursor.x}
          cy={cursor.y}
          r={0.28}
          fill="var(--plan-accent)"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
