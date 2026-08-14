"use client";

import { useEffect, useId, useState } from "react";
import {
  FURNITURE_PRESETS,
  FurnitureKind,
  OpeningKind,
  ROOM_KIND_COLORS,
  ROOM_KIND_LABELS,
  RoomKind,
  formatFeet,
  furnitureLabel,
  planBounds,
  polygonAreaSqft,
  snapToGrid,
  wallLengthFt,
  type PlanFurniture,
  type PlanOpening,
  type PlanPoint,
  type PlanRoom,
  type PlanWall,
} from "@buildora/shared";
import { FurnitureSymbol } from "./furnitureSymbols";

/**
 * The drawing surface of the 2D floor-plan builder.
 *
 * It is one SVG whose **viewBox is measured in feet** — `viewBox="0 0 60 45"`
 * is a sixty-by-forty-five-foot sheet. That single decision removes every
 * pixels-to-feet conversion from the rest of the file: a 10-inch wall is a line
 * with `stroke-width={10/12}`, a room is a polygon of foot coordinates, and the
 * browser handles scaling the sheet into whatever space the card gives it. It
 * is also what makes panning and zooming nearly free — they just move and
 * resize that viewBox, and every pointer position keeps converting correctly
 * because `getScreenCTM()` already accounts for it.
 *
 * Drawing is click-click, not click-drag, because that works identically with a
 * mouse and a finger: first click sets a point, second click completes the
 * shape. Every point is snapped to the grid on the way in, so walls meet
 * exactly instead of almost. Dragging is reserved for *moving* things that are
 * already placed, and for panning the sheet.
 */

export type PlanTool = "select" | "wall" | "room" | "door" | "window" | "furniture";

/** The window onto the sheet, in feet. Panning moves it, zooming resizes it. */
export interface PlanView {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How close (in feet) a click must be to a wall to land a door or window on it. */
const OPENING_SNAP_FT = 2.5;

/**
 * Zoom stops, as a multiple of the starting sheet width: 8× in, 8× out. The
 * outward stop is generous because drawing is not fenced into the sheet — a
 * plan can spread well past it and still has to be viewable in one piece.
 */
const MIN_ZOOM = 1 / 8;
const MAX_ZOOM = 8;

/**
 * Past this much zoomed out, the foot grid is finer than the screen can show
 * and turns into moiré, so only the 5 ft lines are drawn.
 */
const MINOR_GRID_LIMIT = 1.5;

/** An invisible fat line over each wall, so thin walls are still easy to grab. */
const WALL_HIT_FT = 0.9;

/** Breathing room in feet left around the drawing when framing or exporting it. */
export const EXPORT_MARGIN_FT = 4;

/** The starting frame: the sheet sized from the plot, before anything is drawn. */
export function wholeSheet(widthFt: number, heightFt: number): PlanView {
  return { x: 0, y: 0, w: widthFt, h: heightFt };
}

/**
 * The frame that shows the whole drawing with a margin, for "Fit" and for the
 * PNG export. Falls back to the starting sheet on an empty floor, and never
 * returns a zero-sized box — a single horizontal wall has no height of its own.
 */
export function frameAroundPlan(
  walls: PlanWall[],
  rooms: PlanRoom[],
  furniture: PlanFurniture[],
  widthFt: number,
  heightFt: number
): PlanView {
  const drawn = planBounds(walls, rooms, furniture);
  if (!drawn) return wholeSheet(widthFt, heightFt);
  return {
    x: drawn.x - EXPORT_MARGIN_FT,
    y: drawn.y - EXPORT_MARGIN_FT,
    w: drawn.w + EXPORT_MARGIN_FT * 2,
    h: drawn.h + EXPORT_MARGIN_FT * 2,
  };
}

/**
 * Zoom by `factor` about a fixed point in plan coordinates — the pointer for a
 * wheel zoom, the middle of the view for the +/− buttons. Keeping `anchor`
 * under the cursor is what makes wheel zoom feel like it is pulling the paper
 * towards you rather than scrolling past it.
 */
export function zoomView(
  view: PlanView,
  factor: number,
  anchor: PlanPoint,
  widthFt: number
): PlanView {
  const w = Math.min(widthFt * MAX_ZOOM, Math.max(widthFt * MIN_ZOOM, view.w * factor));
  // The clamp may have swallowed part of the requested factor, so recover the
  // factor that was actually applied and scale everything else by that.
  const applied = w / view.w;
  return {
    x: anchor.x - (anchor.x - view.x) * applied,
    y: anchor.y - (anchor.y - view.y) * applied,
    w,
    h: view.h * applied,
  };
}

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

/** A room's tint: its own colour, else its type's, else the default amber. */
function roomInk(room: PlanRoom): { fill: string; line: string; opacity: number } {
  const tint = room.color ?? (room.kind ? ROOM_KIND_COLORS[room.kind] : undefined);
  if (!tint) return { fill: "var(--plan-room)", line: "var(--plan-room-line)", opacity: 1 };
  return { fill: tint, line: tint, opacity: 0.14 };
}

export function PlanCanvas({
  walls,
  rooms,
  openings,
  furniture,
  gridStepFt,
  widthFt,
  heightFt,
  view,
  onViewChange,
  tool,
  ortho,
  readOnly,
  fill,
  wallThicknessIn,
  openingWidthFt,
  roomKind,
  furnitureKind,
  selectedId,
  onSelect,
  onAddWall,
  onAddRoom,
  onAddOpening,
  onAddFurniture,
  onBeginMove,
  onMoveSelection,
  svgRef,
}: {
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
  gridStepFt: number;
  widthFt: number;
  heightFt: number;
  view: PlanView;
  onViewChange: (view: PlanView) => void;
  tool: PlanTool;
  ortho: boolean;
  readOnly: boolean;
  /**
   * Fill the height the parent gives instead of sizing from the sheet's aspect
   * ratio. Used in fullscreen, where the available height is the constraint;
   * the SVG letterboxes the sheet inside whatever box it ends up with.
   */
  fill?: boolean;
  wallThicknessIn: number;
  openingWidthFt: number;
  roomKind: RoomKind;
  furnitureKind: FurnitureKind;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddWall: (wall: PlanWall) => void;
  onAddRoom: (room: PlanRoom) => void;
  onAddOpening: (opening: PlanOpening) => void;
  onAddFurniture: (item: PlanFurniture) => void;
  /** Called once when a drag starts, so the parent can snapshot for undo. */
  onBeginMove: () => void;
  onMoveSelection: (id: string, dx: number, dy: number) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  // The first click of a two-click shape, and where the pointer is now. Both
  // live here rather than in the parent — they are scratch state that vanishes
  // the moment the shape is finished.
  const [draft, setDraft] = useState<PlanPoint | null>(null);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);

  // How wide the canvas is on screen, in CSS pixels. Watched rather than
  // assumed because label sizes are worked out from it, and it changes with the
  // window, with fullscreen, and with the panel layout. The initial guess only
  // has to survive the first frame, before the observer reports.
  const [pixelWidth, setPixelWidth] = useState(600);

  // A pan in progress: where it started on screen, and the view it started from.
  const [pan, setPan] = useState<{ clientX: number; clientY: number; from: PlanView } | null>(null);

  // A drag in progress. `applied` is how much of the movement has already been
  // handed to the parent, so each move only sends the difference.
  const [drag, setDrag] = useState<{
    id: string;
    from: PlanPoint;
    applied: { dx: number; dy: number };
  } | null>(null);

  // Pattern ids must be unique on the page: two canvases would otherwise share
  // one grid definition.
  const patternId = useId();
  const minorGrid = `minor-${patternId}`;
  const majorGrid = `major-${patternId}`;

  const wallById = new Map(walls.map((w) => [w.id, w]));
  const placing = !readOnly && tool !== "select";

  /**
   * Wheel zoom, as a native listener rather than React's `onWheel`.
   *
   * React registers wheel handlers passively at the document root, so
   * `preventDefault()` inside `onWheel` is ignored and the page scrolls behind
   * the drawing. Registering it here with `{ passive: false }` is the only way
   * to stop that.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const anchor = toPlanPoint(svg, e.clientX, e.clientY);
      if (!anchor) return;
      // Scrolling up (negative deltaY) zooms in, which *shrinks* the view.
      onViewChange(zoomView(view, e.deltaY < 0 ? 1 / 1.15 : 1.15, anchor, widthFt));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef, view, onViewChange, widthFt]);

  /** Track the canvas's on-screen width, so labels can be sized in pixels. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width) setPixelWidth(width);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  /**
   * Snap a raw pointer position onto the grid. Nothing is clamped: the paper
   * runs on as far as you pan, and a plan that outgrows its starting frame just
   * keeps going. Framing is worked out afterwards from what was actually drawn
   * (`planBounds`), rather than fenced in beforehand.
   */
  function snapped(point: PlanPoint): PlanPoint {
    return {
      x: snapToGrid(point.x, gridStepFt),
      y: snapToGrid(point.y, gridStepFt),
    };
  }

  /** Middle button, or Alt with the left button, starts a pan from anywhere. */
  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPan({ clientX: e.clientX, clientY: e.clientY, from: view });
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (pan) {
      // Convert the pixels the pointer has travelled into feet using the scale
      // the pan started at, then slide the view the opposite way — dragging
      // right should bring what is on the left into sight.
      const box = e.currentTarget.getBoundingClientRect();
      const feetPerPixel = pan.from.w / box.width;
      onViewChange({
        ...pan.from,
        x: pan.from.x - (e.clientX - pan.clientX) * feetPerPixel,
        y: pan.from.y - (e.clientY - pan.clientY) * feetPerPixel,
      });
      return;
    }

    if (drag) {
      const raw = toPlanPoint(e.currentTarget, e.clientX, e.clientY);
      if (!raw) return;
      // Snap the *distance moved*, not the position, so a piece keeps whatever
      // offset it had from the grid instead of jumping onto it.
      const dx = snapToGrid(raw.x - drag.from.x, gridStepFt);
      const dy = snapToGrid(raw.y - drag.from.y, gridStepFt);
      if (dx === drag.applied.dx && dy === drag.applied.dy) return;
      // The first grid step of an actual move is what makes this a move rather
      // than a click, so that is where the undo snapshot belongs — one per
      // drag, not one per pointer event.
      if (drag.applied.dx === 0 && drag.applied.dy === 0) onBeginMove();
      onMoveSelection(drag.id, dx - drag.applied.dx, dy - drag.applied.dy);
      setDrag({ ...drag, applied: { dx, dy } });
      return;
    }

    if (readOnly || tool === "select") return;
    const raw = toPlanPoint(e.currentTarget, e.clientX, e.clientY);
    if (raw) setCursor(snapped(raw));
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    // A pan or a drag consumes the gesture; it must not also count as a click.
    if (pan) {
      setPan(null);
      return;
    }
    if (drag) {
      setDrag(null);
      return;
    }
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

    if (tool === "furniture") {
      placeFurniture(point);
      return;
    }

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
        name: nextRoomName(rooms, roomKind),
        kind: roomKind,
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

  /** Drop the selected piece at its real-world size, centred on the click. */
  function placeFurniture(point: PlanPoint) {
    const preset = FURNITURE_PRESETS[furnitureKind];
    onAddFurniture({
      id: crypto.randomUUID(),
      kind: furnitureKind,
      x: point.x - preset.widthFt / 2,
      y: point.y - preset.depthFt / 2,
      widthFt: preset.widthFt,
      depthFt: preset.depthFt,
      rotation: 0,
    });
  }

  /**
   * Handlers shared by everything selectable. Selection happens on pointer
   * *down* so the properties panel updates before the drag begins, and so the
   * thing being dragged is unambiguously the thing under the cursor.
   *
   * Ctrl (or Cmd) held down grabs an element **whatever tool is active** — the
   * quick way to nudge a wall you have just drawn without leaving the wall
   * tool. Without the modifier, a click on an element while another tool is
   * active is left alone to bubble up and do whatever that tool does.
   */
  function selectable(id: string) {
    if (readOnly) return {};
    return {
      style: tool === "select" ? { cursor: "move" } : undefined,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || e.altKey) return; // leave Alt+drag to the pan
        if (tool !== "select" && !e.ctrlKey && !e.metaKey) return;

        e.stopPropagation();
        onSelect(id);
        const svg = svgRef.current;
        if (!svg) return;
        const raw = toPlanPoint(svg, e.clientX, e.clientY);
        if (!raw) return;
        svg.setPointerCapture(e.pointerId);
        // Recording the drag also swallows the pointer-up that follows, so a
        // Ctrl-click never doubles as "place a wall point here".
        setDrag({ id, from: raw, applied: { dx: 0, dy: 0 } });
      },
    };
  }

  // Escape abandons a half-drawn shape and ends a wall chain.
  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "Escape") setDraft(null);
  }

  const previewEnd = draft && cursor ? applyOrtho(draft, cursor, tool === "wall" && ortho) : null;
  const ghost = FURNITURE_PRESETS[furnitureKind];

  /**
   * How far the paper and grid are painted: everything in view, so there is no
   * edge to see at any zoom, unioned with the starting sheet *and* with the
   * drawing itself.
   *
   * The union past the view is what keeps the PNG export right. The export
   * reframes onto the drawing's own bounds, which may be nowhere near where the
   * screen happens to be pointed, and a background sized only to the current
   * view would leave that export mostly blank.
   */
  /**
   * Label sizes, converted from the pixels they should occupy into the feet the
   * SVG actually draws in.
   *
   * Everything else here is measured in feet, which is what keeps the geometry
   * honest — a 10" wall is 10" at every zoom. A label is not geometry: it wants
   * to be the same size on screen no matter how far you have zoomed in or how
   * much room the canvas has. `view.w / pixelWidth` is how many feet one screen
   * pixel covers right now, so a pixel size multiplied by it comes out as the
   * feet that renders at exactly that many pixels.
   *
   * Sizing against the measured width rather than the sheet is what stops the
   * text drifting: the same plan on a phone, on a laptop and in fullscreen gets
   * labels you can read, instead of ones scaled to the plot's size in feet.
   */
  const ftPerPx = view.w / pixelWidth;
  const labelSize = {
    roomName: 13 * ftPerPx,
    roomArea: 10 * ftPerPx,
    dimension: 10.5 * ftPerPx,
    furniture: 9.5 * ftPerPx,
    ghost: 12 * ftPerPx,
    cursorDot: 3.5 * ftPerPx,
  };

  const background = (() => {
    const drawn = planBounds(walls, rooms, furniture);
    const left = [0, view.x, drawn ? drawn.x - EXPORT_MARGIN_FT : 0];
    const top = [0, view.y, drawn ? drawn.y - EXPORT_MARGIN_FT : 0];
    const right = [widthFt, view.x + view.w, drawn ? drawn.x + drawn.w + EXPORT_MARGIN_FT : 0];
    const bottom = [heightFt, view.y + view.h, drawn ? drawn.y + drawn.h + EXPORT_MARGIN_FT : 0];
    const x = Math.min(...left);
    const y = Math.min(...top);
    // One extra view's worth of slack on every side. The SVG element rarely has
    // exactly the viewBox's aspect ratio — in fullscreen it has none of its own,
    // and any framed view has its own — so `xMidYMid meet` shows a band of world
    // beyond the viewBox on one axis. Painting only up to the viewBox would put
    // a visible edge in that band.
    const slack = Math.max(view.w, view.h);
    return {
      x: x - slack,
      y: y - slack,
      w: Math.max(...right) - x + slack * 2,
      h: Math.max(...bottom) - y + slack * 2,
    };
  })();

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      style={fill ? undefined : { aspectRatio: `${widthFt} / ${heightFt}` }}
      role="img"
      aria-label="Floor plan drawing canvas"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handleMove}
      onPointerLeave={() => setCursor(null)}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      // The palette lives in CSS variables so the whole drawing re-themes at
      // once, and the PNG export can override them with print colours.
      className={`${fill ? "h-full w-full" : "w-full"} touch-none rounded-xl outline-none select-none
        [--plan-paper:#fdfdfc] [--plan-grid:#e7e5e4] [--plan-grid-major:#d6d3d1]
        [--plan-ink:#1c1917] [--plan-room:#f59e0b1a] [--plan-room-line:#d97706]
        [--plan-dim:#78716c] [--plan-accent:#f59e0b]
        [--plan-furniture-fill:#e7e5e4] [--plan-furniture-pale:#fafaf9]
        [--plan-furniture-dark:#57534e]
        dark:[--plan-paper:#0f172a] dark:[--plan-grid:#1e293b] dark:[--plan-grid-major:#334155]
        dark:[--plan-ink:#e2e8f0] dark:[--plan-room:#f59e0b1f] dark:[--plan-room-line:#fbbf24]
        dark:[--plan-dim:#94a3b8]
        dark:[--plan-furniture-fill:#334155] dark:[--plan-furniture-pale:#475569]
        dark:[--plan-furniture-dark:#0f172a]
        ${pan ? "cursor-grabbing" : placing ? "cursor-crosshair" : "cursor-default"}`}
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
          {view.w <= widthFt * MINOR_GRID_LIMIT && (
            <rect width={5} height={5} fill={`url(#${minorGrid})`} />
          )}
          <path
            d="M 5 0 L 0 0 0 5"
            fill="none"
            stroke="var(--plan-grid-major)"
            strokeWidth={0.07}
          />
        </pattern>
      </defs>

      {/* Paper and grid, covering everything on screen so no edge is ever
          visible however far you zoom or pan. The grid patterns are in
          `userSpaceOnUse` units, so their lines stay locked to the world origin
          no matter where this rectangle happens to start — a 5 ft major line is
          always on a multiple of 5 ft. */}
      <rect
        x={background.x}
        y={background.y}
        width={background.w}
        height={background.h}
        fill="var(--plan-paper)"
      />
      <rect
        x={background.x}
        y={background.y}
        width={background.w}
        height={background.h}
        fill={`url(#${majorGrid})`}
      />

      {/* Rooms sit under the walls so wall lines read as the room's edges. */}
      {rooms.map((room) => {
        const area = polygonAreaSqft(room.points);
        const label = centroid(room.points);
        const isSelected = room.id === selectedId;
        const ink = roomInk(room);
        return (
          <g key={room.id}>
            <polygon
              points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={ink.fill}
              fillOpacity={ink.opacity}
              stroke={isSelected ? "var(--plan-accent)" : ink.line}
              strokeWidth={isSelected ? 0.18 : 0.08}
              strokeDasharray={isSelected ? undefined : "0.5 0.35"}
              {...selectable(room.id)}
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              fontSize={labelSize.roomName}
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
              dy={labelSize.roomArea * 1.5}
              textAnchor="middle"
              fontSize={labelSize.roomArea}
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
        <g key={wall.id}>
          <line
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke={wall.id === selectedId ? "var(--plan-accent)" : "var(--plan-ink)"}
            strokeWidth={wall.thicknessIn / 12}
            strokeLinecap="round"
            pointerEvents="none"
          />
          {/* Invisible grab handle: a 5" partition is under half a foot wide,
              which is a hard target to hit and an even harder one to drag.
              It stays live under every tool so Ctrl-click can reach a wall;
              without the modifier the event simply bubbles on to the tool. */}
          <line
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke="transparent"
            strokeWidth={Math.max(WALL_HIT_FT, wall.thicknessIn / 12)}
            strokeLinecap="round"
            pointerEvents={readOnly ? "none" : "stroke"}
            {...selectable(wall.id)}
          />
        </g>
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

      {/* Furniture. One transform puts each piece where it goes and turns it to
          face the right way, so the symbols themselves are drawn square. */}
      {furniture.map((item) => {
        const isSelected = item.id === selectedId;
        // Rotation turns about the piece's own centre, so the centre stays put
        // no matter which way the piece faces — which makes it the one point
        // the upright label can be hung from without any trigonometry.
        const cx = item.x + item.widthFt / 2;
        const cy = item.y + item.depthFt / 2;
        // How far below that centre the footprint reaches once turned. At 90°
        // and 270° the piece's width is what runs down the sheet.
        const halfDown = item.rotation % 180 === 90 ? item.widthFt / 2 : item.depthFt / 2;
        return (
          <g key={item.id}>
            <g
              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.widthFt / 2} ${item.depthFt / 2})`}
            >
              <FurnitureSymbol
                kind={item.kind}
                widthFt={item.widthFt}
                depthFt={item.depthFt}
                stroke={isSelected ? "var(--plan-accent)" : "var(--plan-dim)"}
              />
              {isSelected && (
                <rect
                  x={-0.15}
                  y={-0.15}
                  width={item.widthFt + 0.3}
                  height={item.depthFt + 0.3}
                  fill="none"
                  stroke="var(--plan-accent)"
                  strokeWidth={0.09}
                  strokeDasharray="0.4 0.3"
                  pointerEvents="none"
                />
              )}
              {/* A transparent panel over the whole piece, so the drag target is
                  the whole box rather than only the inked parts of the symbol. */}
              <rect
                x={0}
                y={0}
                width={item.widthFt}
                height={item.depthFt}
                fill="transparent"
                pointerEvents={readOnly ? "none" : "all"}
                {...selectable(item.id)}
              />
            </g>
            {/* Outside the rotate, so the name reads left-to-right whichever
                way the piece is turned. */}
            <text
              x={cx}
              y={cy + halfDown + labelSize.furniture * 1.15}
              textAnchor="middle"
              fontSize={labelSize.furniture}
              fill="var(--plan-dim)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              pointerEvents="none"
            >
              {furnitureLabel(item)}
            </text>
          </g>
        );
      })}

      {/* Dimension labels: each wall's length, rotated to sit along it. */}
      {walls.map((wall) => {
        const length = wallLengthFt(wall);
        // Too short to label without the text overrunning the wall. The
        // threshold moves with the zoom for the same reason the text does:
        // zoomed right in, there is room to dimension a 6" jog.
        if (length < labelSize.dimension * 4) return null;
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
            dy={labelSize.dimension * -0.5}
            transform={`rotate(${upright} ${mx} ${my})`}
            textAnchor="middle"
            fontSize={labelSize.dimension}
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
        <g data-transient="true" pointerEvents="none">
          <rect
            x={Math.min(draft.x, cursor.x)}
            y={Math.min(draft.y, cursor.y)}
            width={Math.abs(cursor.x - draft.x)}
            height={Math.abs(cursor.y - draft.y)}
            fill={ROOM_KIND_COLORS[roomKind]}
            fillOpacity={0.14}
            stroke="var(--plan-accent)"
            strokeWidth={0.12}
            strokeDasharray="0.5 0.35"
          />
          {/* The size as you drag it out, so you can hit 12×10 without guessing. */}
          <text
            x={(draft.x + cursor.x) / 2}
            y={(draft.y + cursor.y) / 2}
            textAnchor="middle"
            fontSize={labelSize.ghost}
            fontWeight={700}
            fill="var(--plan-ink)"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {Math.abs(cursor.x - draft.x)} × {Math.abs(cursor.y - draft.y)} ft
          </text>
        </g>
      )}

      {/* A ghost of the piece about to be placed, at its true size. */}
      {cursor && tool === "furniture" && !readOnly && (
        <g
          data-transient="true"
          pointerEvents="none"
          opacity={0.5}
          transform={`translate(${cursor.x - ghost.widthFt / 2} ${cursor.y - ghost.depthFt / 2})`}
        >
          <FurnitureSymbol
            kind={furnitureKind}
            widthFt={ghost.widthFt}
            depthFt={ghost.depthFt}
            stroke="var(--plan-accent)"
          />
        </g>
      )}

      {/* The snapped cursor, so it is obvious where the next click will land. */}
      {cursor && placing && tool !== "furniture" && (
        <circle
          data-transient="true"
          cx={cursor.x}
          cy={cursor.y}
          r={labelSize.cursorDot}
          fill="var(--plan-accent)"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

/**
 * Name a new room after its type, numbering repeats: the first bedroom is
 * "Bedroom", the next "Bedroom 2". Counting existing rooms of the same kind
 * rather than all rooms means adding a kitchen never renumbers the bedrooms.
 */
function nextRoomName(rooms: PlanRoom[], kind: RoomKind): string {
  const base = ROOM_KIND_LABELS[kind];
  const sameKind = rooms.filter((r) => r.kind === kind).length;
  return sameKind === 0 ? base : `${base} ${sameKind + 1}`;
}
