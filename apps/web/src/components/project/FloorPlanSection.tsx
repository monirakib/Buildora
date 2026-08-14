"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import {
  FURNITURE_PRESETS,
  FurnitureKind,
  OpeningKind,
  ROOM_KIND_COLORS,
  ROOM_KIND_LABELS,
  RoomKind,
  floorAreaSqft,
  floorLabel,
  formatFeet,
  kathaToSqft,
  rectFromPoints,
  rectRoomPoints,
  translatePoints,
  wallLengthFt,
  type PlanCompliance,
  type PlanFurniture,
  type PlanOpening,
  type PlanRoom,
  type PlanWall,
  type Project,
} from "@buildora/shared";
import { deleteFloorPlan, listFloorPlans, saveFloorPlan } from "@/lib/apiFloorPlans";
import {
  PlanCanvas,
  frameAroundPlan,
  wholeSheet,
  zoomView,
  type PlanTool,
  type PlanView,
} from "./PlanCanvas";
import { LayoutAdvisor } from "./LayoutAdvisor";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const selectClass =
  "rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-900 outline-none transition focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

const overlayClass =
  "pointer-events-none absolute rounded-lg border border-black/10 bg-white/85 px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 backdrop-blur dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-300";

/** Compact select for the drawing options row, where the toolbar select is too tall. */
const miniSelectClass =
  "rounded-lg border border-stone-300/80 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-stone-900 outline-none transition focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

/** Square icon button: fullscreen in the toolbar, zoom over the drawing. */
const iconButtonClass =
  "pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white/85 text-base font-bold text-stone-600 backdrop-blur transition hover:border-amber-400 hover:text-stone-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:text-white";

/** Everything the editor holds for one floor. */
interface PlanGeometry {
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  furniture: PlanFurniture[];
  gridStepFt: number;
}

const emptyFloor: PlanGeometry = {
  walls: [],
  rooms: [],
  openings: [],
  furniture: [],
  gridStepFt: 1,
};

/** How many steps back the undo stack remembers, per floor. */
const UNDO_LIMIT = 40;

/** The narrowest opening the API will store, so the narrowest worth keeping. */
const MIN_OPENING_FT = 0.5;

/** Geometry to the nearest thousandth of a foot, matching what the API stores. */
function round3(feet: number): number {
  return Number(feet.toFixed(3));
}

/**
 * The tools, in the order they appear and in the order their number-key
 * shortcuts run. Digits rather than letters because every obvious letter for
 * "select", "wall" or "door" is already spoken for by the browser once you add
 * a modifier — Ctrl+W closes the tab, Ctrl+D bookmarks the page — and bare
 * letters would fight the room-name box the moment focus slipped.
 */
const tools: { id: PlanTool; label: string; hint: string }[] = [
  {
    id: "select",
    label: "Select",
    hint: "Click a wall, room, or piece to select it, then drag to move it",
  },
  { id: "wall", label: "Wall", hint: "Click to start, click again to end, walls chain on" },
  { id: "room", label: "Room", hint: "Pick a room type, then click two opposite corners" },
  { id: "door", label: "Door", hint: "Click on a wall to cut a door into it" },
  { id: "window", label: "Window", hint: "Click on a wall to cut a window into it" },
  { id: "furniture", label: "Furniture", hint: "Pick a piece, then click where it goes" },
];

/** The room colour picker: one swatch per room type, plus a few spares. */
const SWATCHES = [...new Set(Object.values(ROOM_KIND_COLORS))].concat([
  "#c0392b",
  "#8e44ad",
  "#16a085",
]);

/**
 * Colours baked into the exported PNG. The on-screen palette lives in CSS
 * variables, which do not survive being serialised away from the stylesheet —
 * so the export sets them inline, always in print colours on white.
 */
const PRINT_PALETTE = [
  "--plan-paper:#ffffff",
  "--plan-grid:#ececec",
  "--plan-grid-major:#d9d9d9",
  "--plan-ink:#111111",
  "--plan-room:#f59e0b18",
  "--plan-room-line:#c2760a",
  "--plan-dim:#666666",
  "--plan-accent:#f59e0b",
  "--plan-furniture-fill:#eeeeee",
  "--plan-furniture-pale:#fafafa",
  "--plan-furniture-dark:#555555",
].join(";");

/**
 * The 2D floor-plan builder — the layout drawn before any 3D model exists.
 *
 * One floor is edited at a time (tabs across the top), each stored as its own
 * record. Every edit stays in memory until "Save floor" is pressed, so drawing
 * never blocks on the network; switching floors keeps unsaved work in state and
 * flags the tab with a dot.
 */
export function FloorPlanSection({ project, token }: { project: Project; token: string }) {
  // Geometry per level, so switching tabs does not lose unsaved work.
  const [floors, setFloors] = useState<Record<number, PlanGeometry>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [level, setLevel] = useState(0);
  const [compliance, setCompliance] = useState<PlanCompliance | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [savedBy, setSavedBy] = useState<Record<number, string>>({});

  // Undo snapshots, newest last, kept per floor so undoing on the 1st floor
  // can never reach back into the ground floor's history.
  const [history, setHistory] = useState<Record<number, PlanGeometry[]>>({});

  const [tool, setTool] = useState<PlanTool>("select");
  const [ortho, setOrtho] = useState(true);
  const [wallThicknessIn, setWallThicknessIn] = useState(10);
  const [openingWidthFt, setOpeningWidthFt] = useState(3);
  const [roomKind, setRoomKind] = useState<RoomKind>(RoomKind.BEDROOM);
  const [furnitureKind, setFurnitureKind] = useState<FurnitureKind>(FurnitureKind.BED_DOUBLE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"properties" | "advisor">("properties");
  // Bumped whenever the floor's geometry is thrown away wholesale. The canvas
  // keeps the pending start point of a wall run in its own state, and that
  // point has to go with the walls it belonged to. See the canvas `key` below.
  const [resetToken, setResetToken] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // The part of the card that goes fullscreen: everything from the floor tabs
  // down to the save buttons. The compliance panel stays outside — in
  // fullscreen the screen belongs to the drawing.
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Tabs for every floor the brief asked for — at least a ground floor.
  const levels = Array.from({ length: Math.max(1, project.floors) }, (_, i) => i);
  const plan = floors[level] ?? emptyFloor;

  // Size the sheet from the plot: a square-ish plot of this area, with room to
  // draw around it. Rounded up to 10 ft so the 5 ft major grid stays whole.
  const plotSideFt = Math.sqrt(kathaToSqft(project.landAreaKatha));
  const widthFt = Math.max(40, Math.ceil((plotSideFt * 1.3) / 10) * 10);
  const heightFt = Math.round(widthFt * 0.75);

  // Which part of the sheet is on screen. It lives here rather than in the
  // canvas because the canvas is remounted whenever the tool or floor changes,
  // and losing your zoom every time you pick up a different tool is maddening.
  const [view, setView] = useState<PlanView>(() => wholeSheet(widthFt, heightFt));

  useEffect(() => {
    (async () => {
      try {
        const result = await listFloorPlans(token, project.id);
        const loaded: Record<number, PlanGeometry> = {};
        const editors: Record<number, string> = {};
        for (const p of result.plans) {
          loaded[p.level] = {
            walls: p.walls,
            rooms: p.rooms,
            openings: p.openings,
            // Plans saved before furniture existed have no array at all.
            furniture: p.furniture ?? [],
            gridStepFt: p.gridStepFt,
          };
          if (p.updatedBy) editors[p.level] = p.updatedBy.name;
        }
        setFloors(loaded);
        setSavedBy(editors);
        setCompliance(result.compliance);
        setCanEdit(result.canEdit);
        if (result.canEdit) setTool("wall");
        // Open on the drawing rather than on the corner of an empty sheet. A
        // plan drawn in one part of the plot would otherwise load sitting off
        // to one side with the rest of the frame blank.
        const ground = loaded[0];
        if (ground) {
          setView(frameAroundPlan(ground.walls, ground.rooms, ground.furniture, widthFt, heightFt));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the floor plans");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, project.id]);

  /**
   * Apply a change to the active floor and mark it unsaved.
   *
   * Every mutation goes through here, which is what makes undo a single hook:
   * the floor as it stands is pushed onto the stack before the change lands.
   * A drag is the one exception — it fires dozens of times per second, so it
   * snapshots once itself and passes `snapshot: false` for the rest.
   */
  function editFloor(
    change: (current: PlanGeometry) => PlanGeometry,
    { snapshot = true }: { snapshot?: boolean } = {}
  ) {
    if (snapshot) pushUndo();
    setFloors((all) => ({ ...all, [level]: change(all[level] ?? emptyFloor) }));
    setDirty((all) => ({ ...all, [level]: true }));
  }

  /**
   * Remember the active floor as it is right now, for undo. Geometry is only
   * ever replaced, never mutated in place, so keeping the object itself is a
   * complete snapshot — no copying needed.
   */
  function pushUndo() {
    const current = floors[level] ?? emptyFloor;
    setHistory((past) => ({
      ...past,
      [level]: [...(past[level] ?? []), current].slice(-UNDO_LIMIT),
    }));
  }

  function undo() {
    const stack = history[level] ?? [];
    const previous = stack[stack.length - 1];
    if (!previous) return;
    setFloors((all) => ({ ...all, [level]: previous }));
    setHistory((past) => ({ ...past, [level]: (past[level] ?? []).slice(0, -1) }));
    setDirty((all) => ({ ...all, [level]: true }));
    setSelectedId(null);
  }

  function addWall(wall: PlanWall) {
    editFloor((f) => ({ ...f, walls: [...f.walls, wall] }));
  }

  function addRoom(room: PlanRoom) {
    editFloor((f) => ({ ...f, rooms: [...f.rooms, room] }));
  }

  function addOpening(opening: PlanOpening) {
    editFloor((f) => ({ ...f, openings: [...f.openings, opening] }));
  }

  function addFurniture(item: PlanFurniture) {
    editFloor((f) => ({ ...f, furniture: [...f.furniture, item] }));
    setSelectedId(item.id);
  }

  /**
   * Shift whatever is being dragged. Openings are stored as a distance *along*
   * their wall rather than as their own coordinates, so moving a wall carries
   * its doors and windows with it and there is nothing to do for them here.
   */
  function moveSelection(id: string, dx: number, dy: number) {
    editFloor(
      (f) => ({
        ...f,
        walls: f.walls.map((w) =>
          w.id === id ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w
        ),
        rooms: f.rooms.map((r) =>
          r.id === id ? { ...r, points: translatePoints(r.points, dx, dy) } : r
        ),
        furniture: f.furniture.map((i) => (i.id === id ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
      }),
      { snapshot: false }
    );
  }

  /**
   * Remove whatever is selected. Deleting a wall also removes the doors and
   * windows sitting on it — an opening with no wall is meaningless, and the
   * API rejects a plan that contains one.
   */
  function deleteSelected() {
    if (!selectedId) return;
    editFloor((f) => ({
      ...f,
      walls: f.walls.filter((w) => w.id !== selectedId),
      rooms: f.rooms.filter((r) => r.id !== selectedId),
      openings: f.openings.filter((o) => o.id !== selectedId && o.wallId !== selectedId),
      furniture: f.furniture.filter((i) => i.id !== selectedId),
    }));
    setSelectedId(null);
  }

  /** Change one field on the selected room. */
  function patchRoom(patch: Partial<PlanRoom>) {
    editFloor((f) => ({
      ...f,
      rooms: f.rooms.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
    }));
  }

  /** Change one field on the selected piece of furniture. */
  function patchFurniture(patch: Partial<PlanFurniture>) {
    editFloor((f) => ({
      ...f,
      furniture: f.furniture.map((i) => (i.id === selectedId ? { ...i, ...patch } : i)),
    }));
  }

  /** Resize a rectangular room by typing a size, holding its top-left corner. */
  function resizeRoom(room: PlanRoom, widthFt: number, heightFt: number) {
    const rect = rectFromPoints(room.points);
    if (!rect) return;
    patchRoom({ points: rectRoomPoints(rect.x, rect.y, widthFt, heightFt) });
  }

  /**
   * Retype a wall's length. The start point is held and the far end slides
   * along the wall's own direction, so a chained run stays joined at the
   * corners instead of coming apart when one leg is retyped.
   *
   * Doors and windows are stored as a distance *along* the wall, so shortening
   * one can push an opening off the end — and the API rejects a plan where that
   * has happened. Rather than let a save fail on something the panel caused,
   * the openings on this wall are pulled back inside it here: slid in if they
   * hang over, narrowed if they no longer fit, dropped if there is no longer a
   * wall wide enough to hold anything.
   */
  function resizeWall(wall: PlanWall, lengthFt: number) {
    const current = wallLengthFt(wall);
    if (current === 0) return; // no direction to grow along
    const ux = (wall.x2 - wall.x1) / current;
    const uy = (wall.y2 - wall.y1) / current;

    editFloor((f) => ({
      ...f,
      walls: f.walls.map((w) =>
        w.id === wall.id
          ? { ...w, x2: round3(wall.x1 + ux * lengthFt), y2: round3(wall.y1 + uy * lengthFt) }
          : w
      ),
      openings: f.openings.flatMap((o) => {
        if (o.wallId !== wall.id) return [o];
        if (lengthFt < MIN_OPENING_FT) return [];
        const widthFt = Math.min(o.widthFt, lengthFt);
        return [
          {
            ...o,
            widthFt: round3(widthFt),
            offsetFt: round3(Math.max(0, Math.min(o.offsetFt, lengthFt - widthFt))),
          },
        ];
      }),
    }));
  }

  /** Turn the selected piece a quarter turn, the way you would on site. */
  function rotateFurniture() {
    if (!selectedFurniture) return;
    patchFurniture({ rotation: (selectedFurniture.rotation + 90) % 360 });
  }

  const selectedRoom = plan.rooms.find((r) => r.id === selectedId);
  const selectedWall = plan.walls.find((w) => w.id === selectedId);
  const selectedOpening = plan.openings.find((o) => o.id === selectedId);
  const selectedFurniture = plan.furniture.find((i) => i.id === selectedId);

  /**
   * Editor keyboard shortcuts. Everything is skipped while a form field has
   * focus, or Backspace in the room-name box would delete the room instead of
   * a letter.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (canEdit) undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave the browser's own keys alone
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
        return;
      }
      if (!canEdit) return;

      // 1…6 pick a tool, in the order they sit in the toolbar.
      const slot = Number(e.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= tools.length) {
        pickTool(tools[slot - 1]!.id);
        return;
      }

      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key.toLowerCase() === "r" && selectedFurniture) {
        rotateFurniture();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // The browser owns fullscreen state — Escape and F11 change it without
  // telling us — so mirror it from the event rather than from our own clicks.
  useEffect(() => {
    function sync() {
      setFullscreen(document.fullscreenElement === shellRef.current);
    }
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      setError("This browser wouldn't let the editor go fullscreen");
    }
  }

  /** Switch tools, clearing the selection the way the toolbar buttons do. */
  function pickTool(id: PlanTool) {
    setTool(id);
    setSelectedId(null);
    // Windows are wider than doors by default.
    if (id === "window") setOpeningWidthFt(4);
    if (id === "door") setOpeningWidthFt(3);
  }

  // Picking from the palette also arms the matching tool — choosing "Kitchen"
  // and then having to remember to press "Room" would be a step that exists
  // only because the code is arranged that way.
  function pickRoomKind(kind: RoomKind) {
    setRoomKind(kind);
    pickTool("room");
  }

  function pickFurnitureKind(kind: FurnitureKind) {
    setFurnitureKind(kind);
    pickTool("furniture");
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveFloorPlan(token, project.id, { level, ...plan });
      setCompliance(result.compliance);
      setDirty((all) => ({ ...all, [level]: false }));
      if (result.plan.updatedBy) {
        setSavedBy((all) => ({ ...all, [level]: result.plan.updatedBy!.name }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this floor");
    } finally {
      setBusy(false);
    }
  }

  async function clearFloor() {
    if (!window.confirm(`Clear everything on the ${floorLabel(level).toLowerCase()}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const next = await deleteFloorPlan(token, project.id, level);
      setFloors((all) => ({ ...all, [level]: { ...emptyFloor, gridStepFt: plan.gridStepFt } }));
      setDirty((all) => ({ ...all, [level]: false }));
      setHistory((past) => ({ ...past, [level]: [] }));
      setSelectedId(null);
      setResetToken((n) => n + 1); // drop any half-drawn wall run with the walls
      // The record is gone, so there is no longer anyone who last saved it.
      setSavedBy((all) => {
        const rest = { ...all };
        delete rest[level];
        return rest;
      });
      setCompliance(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clear this floor");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Export the floor as a PNG: clone the live SVG, strip the drawing helpers,
   * swap in print colours, then paint it into a canvas at 20 px per foot and
   * download the result.
   */
  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-transient]").forEach((el) => el.remove());
    clone.setAttribute("style", PRINT_PALETTE);
    // The clone inherits whatever the screen is zoomed to. Reframe it onto the
    // drawing's own bounds, so the export is the plan however far it has spread
    // and wherever the screen happened to be pointed.
    const frame = planFrame();
    clone.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);

    // Labels are sized to hold a constant size on screen, which means they are
    // sized against whatever the screen is currently zoomed to (`textScale` in
    // PlanCanvas). Reframing the clone changes that, so every label has to be
    // rescaled by the same ratio — otherwise a plan exported while zoomed in
    // comes out with dimensions too small to read.
    const labelScale = frame.w / view.w;
    if (labelScale !== 1) {
      clone.querySelectorAll("text").forEach((label) => {
        for (const attribute of ["font-size", "dy"]) {
          const value = Number(label.getAttribute(attribute));
          if (value) label.setAttribute(attribute, String(value * labelScale));
        }
      });
    }

    const pxPerFoot = 20;
    const pixelWidth = Math.round(frame.w * pxPerFoot);
    const pixelHeight = Math.round(frame.h * pxPerFoot);
    clone.setAttribute("width", String(pixelWidth));
    clone.setAttribute("height", String(pixelHeight));

    const markup = new XMLSerializer().serializeToString(clone);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);

      const link = document.createElement("a");
      link.download = `${project.title.replace(/\s+/g, "-").toLowerCase()}-${floorLabel(level)
        .replace(/\s+/g, "-")
        .toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    image.onerror = () => setError("Couldn't render the drawing to an image");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }

  /** Zoom about the middle of what is currently on screen. */
  function zoomBy(factor: number) {
    setView((v) => zoomView(v, factor, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, widthFt));
  }

  /** Everything drawn on this floor with a margin, or the starting sheet. */
  function planFrame(): PlanView {
    return frameAroundPlan(plan.walls, plan.rooms, plan.furniture, widthFt, heightFt);
  }

  const floorArea = floorAreaSqft(plan.rooms);
  const canUndo = (history[level] ?? []).length > 0;

  // Headline for the properties panel: what is selected, and how big it is.
  const selection = describeSelection({
    room: selectedRoom,
    furniture: selectedFurniture,
    wall: selectedWall,
    opening: selectedOpening,
  });

  // Three columns when there are settings to show, two when the owner is only
  // reading. The side columns are sized to their content and no wider — the
  // drawing is the point of the screen, so it gets everything left over.
  // Below `lg` it is always one column and everything stacks.
  const workspaceColumns = canEdit
    ? "lg:grid-cols-[9.5rem_minmax(0,1fr)_15rem]"
    : "lg:grid-cols-[minmax(0,1fr)_15rem]";

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Floor plan</h2>

      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-stone-500 dark:text-slate-500">Loading the plan…</p>
        ) : (
          <>
            {/* In fullscreen this div *is* the page, so it has to supply its own
                background and lay itself out top-to-bottom with the drawing
                taking whatever height is left over. */}
            <div
              ref={shellRef}
              className={
                fullscreen
                  ? "flex h-full flex-col overflow-auto bg-stone-100 p-4 dark:bg-slate-950"
                  : undefined
              }
            >
              {/* ── Toolbar ─────────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-2 border-b border-black/10 pb-3 dark:border-white/10">
                {/* A dropdown rather than a tab per floor: an eight-storey
                    building would otherwise wrap two rows of pills before the
                    tools even start. The dot marks a floor with unsaved work. */}
                <select
                  value={level}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    const geometry = floors[next] ?? emptyFloor;
                    setLevel(next);
                    setSelectedId(null);
                    // Re-frame on the floor you switched to. Its plan may sit
                    // nowhere near the one you were looking at.
                    setView(
                      frameAroundPlan(
                        geometry.walls,
                        geometry.rooms,
                        geometry.furniture,
                        widthFt,
                        heightFt
                      )
                    );
                  }}
                  aria-label="Floor"
                  className={selectClass}
                >
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {floorLabel(l)}
                      {dirty[l] ? " •" : ""}
                    </option>
                  ))}
                </select>

                {canEdit && (
                  <>
                    <span className="mx-0.5 h-6 w-px bg-black/10 dark:bg-white/15" />

                    {tools.map((t, i) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => pickTool(t.id)}
                        // The how-to-use-it text lives on hover rather than as a
                        // banner over the drawing, where it sat in the way.
                        title={`${t.label} (${i + 1}) · ${t.hint}`}
                        className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                          t.id === tool
                            ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                            : "text-stone-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                        }`}
                      >
                        {t.label}
                        <span className="ml-1.5 opacity-50">{i + 1}</span>
                      </button>
                    ))}

                    <span className="mx-0.5 h-6 w-px bg-black/10 dark:bg-white/15" />

                    <button
                      type="button"
                      onClick={undo}
                      disabled={!canUndo}
                      title="Undo (Ctrl+Z)"
                      className="rounded-lg px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-black/5 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      Undo
                      <span className="ml-1.5 opacity-50">Ctrl+Z</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearFloor}
                      disabled={busy}
                      className="rounded-lg px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-black/5 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      Clear
                    </button>
                  </>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportPng}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Export PNG
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={save}
                      disabled={busy || !dirty[level]}
                      className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : dirty[level] ? "Save floor" : "Saved"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={fullscreen ? "Exit fullscreen" : "Edit fullscreen"}
                    title={`${fullscreen ? "Exit fullscreen" : "Edit fullscreen"} (F)`}
                    className={iconButtonClass}
                  >
                    {fullscreen ? (
                      <Minimize className="h-4 w-4" />
                    ) : (
                      <Maximize className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* ── Draw settings · drawing · properties ────────────────── */}
              <div
                className={`grid gap-3 pt-3 ${workspaceColumns} ${fullscreen ? "min-h-0 flex-1" : ""}`}
              >
                {/* Everything about *what gets drawn next* lives in this one
                    column: which room, which piece of furniture, how thick the
                    wall, how fine the grid. The toolbar above stays actions
                    only. Two columns of fields on a phone, one on a wide
                    screen, so it never squeezes the drawing. */}
                {canEdit && (
                  <aside className="grid grid-cols-2 gap-x-3 gap-y-2.5 self-start sm:grid-cols-3 lg:grid-cols-1">
                    <PanelField label="Room type">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-4 w-4 shrink-0 rounded-sm"
                          style={{ background: ROOM_KIND_COLORS[roomKind] }}
                        />
                        <select
                          value={roomKind}
                          onChange={(e) => pickRoomKind(e.target.value as RoomKind)}
                          className={`min-w-0 flex-1 ${miniSelectClass}`}
                          aria-label="Room type to draw"
                        >
                          {Object.values(RoomKind).map((kind) => (
                            <option key={kind} value={kind}>
                              {ROOM_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </PanelField>

                    <PanelField label="Furniture">
                      <select
                        value={furnitureKind}
                        onChange={(e) => pickFurnitureKind(e.target.value as FurnitureKind)}
                        className={`w-full ${miniSelectClass}`}
                        aria-label="Furniture to place"
                      >
                        {Object.values(FurnitureKind).map((kind) => {
                          const preset = FURNITURE_PRESETS[kind];
                          return (
                            <option key={kind} value={kind}>
                              {preset.label} · {preset.widthFt}×{preset.depthFt} ft
                            </option>
                          );
                        })}
                      </select>
                    </PanelField>

                    <PanelField label="Wall thickness">
                      <select
                        value={wallThicknessIn}
                        onChange={(e) => setWallThicknessIn(Number(e.target.value))}
                        className={`w-full ${miniSelectClass}`}
                        aria-label="Wall thickness"
                      >
                        <option value={5}>5&quot; partition</option>
                        <option value={10}>10&quot; exterior</option>
                      </select>
                    </PanelField>

                    <PanelField label="Opening width">
                      <select
                        value={openingWidthFt}
                        onChange={(e) => setOpeningWidthFt(Number(e.target.value))}
                        className={`w-full ${miniSelectClass}`}
                        aria-label="Opening width"
                      >
                        {[2.5, 3, 3.5, 4, 5, 6].map((w) => (
                          <option key={w} value={w}>
                            {w} ft wide
                          </option>
                        ))}
                      </select>
                    </PanelField>

                    <PanelField label="Grid">
                      <select
                        value={plan.gridStepFt}
                        onChange={(e) =>
                          editFloor((f) => ({ ...f, gridStepFt: Number(e.target.value) }))
                        }
                        className={`w-full ${miniSelectClass}`}
                        aria-label="Grid step"
                      >
                        <option value={0.5}>6&quot; grid</option>
                        <option value={1}>1 ft grid</option>
                        <option value={2}>2 ft grid</option>
                      </select>
                    </PanelField>

                    <label className="flex items-center gap-2 self-end pb-1.5 text-xs font-semibold text-stone-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={ortho}
                        onChange={(e) => setOrtho(e.target.checked)}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Straight walls
                    </label>
                  </aside>
                )}

                <div className="relative min-h-0">
                  <div
                    className={`overflow-hidden rounded-xl border border-black/10 dark:border-white/10 ${
                      fullscreen ? "h-full" : ""
                    }`}
                  >
                    <PlanCanvas
                      // The canvas owns the pending start point of the shape being
                      // drawn, so remounting it is how that point gets thrown away.
                      // It has to go whenever the floor, the tool, or the geometry
                      // itself changes underneath it — otherwise the next click draws
                      // a wall from a point that belonged to a floor you have left,
                      // or to walls you have just cleared.
                      key={`${level}-${tool}-${resetToken}`}
                      walls={plan.walls}
                      rooms={plan.rooms}
                      openings={plan.openings}
                      furniture={plan.furniture}
                      gridStepFt={plan.gridStepFt}
                      widthFt={widthFt}
                      heightFt={heightFt}
                      view={view}
                      onViewChange={setView}
                      tool={canEdit ? tool : "select"}
                      ortho={ortho}
                      readOnly={!canEdit}
                      fill={fullscreen}
                      wallThicknessIn={wallThicknessIn}
                      openingWidthFt={openingWidthFt}
                      roomKind={roomKind}
                      furnitureKind={furnitureKind}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onAddWall={addWall}
                      onAddRoom={addRoom}
                      onAddOpening={addOpening}
                      onAddFurniture={addFurniture}
                      onBeginMove={pushUndo}
                      onMoveSelection={moveSelection}
                      svgRef={svgRef}
                    />
                  </div>

                  {/* What is on this floor, at a glance. */}
                  <div className={`${overlayClass} top-2 left-2`}>
                    {plan.rooms.length} {plan.rooms.length === 1 ? "room" : "rooms"} ·{" "}
                    {Math.round(floorArea).toLocaleString()} sq ft · 1 cell ={" "}
                    {plan.gridStepFt === 1 ? "1 ft" : `${plan.gridStepFt} ft`}
                  </div>

                  <div className="pointer-events-none absolute right-2 bottom-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => zoomBy(1 / 1.3)}
                      aria-label="Zoom in"
                      className={iconButtonClass}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomBy(1.3)}
                      aria-label="Zoom out"
                      className={iconButtonClass}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setView(planFrame())}
                      aria-label="Fit the drawing"
                      title="Fit the drawing"
                      className={`${iconButtonClass} text-[11px]`}
                    >
                      Fit
                    </button>
                  </div>
                </div>

                {/* Properties and the layout advisor share the right column. */}
                <aside
                  className={`rounded-xl border border-black/10 dark:border-white/10 ${
                    fullscreen ? "min-h-0 overflow-y-auto" : ""
                  }`}
                >
                  <div className="flex border-b border-black/10 dark:border-white/10">
                    {(["properties", "advisor"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPanelTab(t)}
                        className={`flex-1 px-3 py-2.5 text-xs font-bold transition ${
                          panelTab === t
                            ? "border-b-2 border-amber-400 text-stone-900 dark:text-white"
                            : "text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {t === "properties" ? "Properties" : "Layout advisor"}
                      </button>
                    ))}
                  </div>

                  {panelTab === "advisor" ? (
                    <LayoutAdvisor
                      token={token}
                      projectId={project.id}
                      level={level}
                      rooms={plan.rooms}
                      furniture={plan.furniture}
                      compliance={compliance}
                      areaName={project.areaName}
                    />
                  ) : (
                    <div className="space-y-3 p-3">
                      {!selectedId && (
                        <p className="py-6 text-center text-xs text-stone-500 dark:text-slate-500">
                          {canEdit
                            ? "Select something on the drawing to rename, resize or recolour it."
                            : "Select something on the drawing to see its measurements."}
                        </p>
                      )}

                      {selection && (
                        <div className="rounded-lg border border-black/10 bg-black/3 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                          <p className="text-sm font-bold">{selection.title}</p>
                          <p className="text-[11px] text-stone-500 dark:text-slate-500">
                            {selection.subtitle}
                          </p>
                        </div>
                      )}

                      {selectedRoom && (
                        <>
                          <PanelField label="Label">
                            <input
                              value={selectedRoom.name}
                              onChange={(e) => patchRoom({ name: e.target.value })}
                              maxLength={40}
                              disabled={!canEdit}
                              className={`w-full ${selectClass}`}
                            />
                          </PanelField>

                          <PanelField label="Room type">
                            <select
                              value={selectedRoom.kind ?? RoomKind.OTHER}
                              onChange={(e) => patchRoom({ kind: e.target.value as RoomKind })}
                              disabled={!canEdit}
                              className={`w-full ${selectClass}`}
                            >
                              {Object.values(RoomKind).map((kind) => (
                                <option key={kind} value={kind}>
                                  {ROOM_KIND_LABELS[kind]}
                                </option>
                              ))}
                            </select>
                          </PanelField>

                          <RoomSize room={selectedRoom} canEdit={canEdit} onResize={resizeRoom} />

                          <PanelField label="Colour">
                            <div className="flex flex-wrap gap-1.5">
                              {SWATCHES.map((colour) => (
                                <button
                                  key={colour}
                                  type="button"
                                  aria-label={`Colour ${colour}`}
                                  disabled={!canEdit}
                                  onClick={() => patchRoom({ color: colour })}
                                  style={{ background: colour }}
                                  className={`h-6 w-6 rounded-md border-2 transition ${
                                    selectedRoom.color === colour
                                      ? "border-stone-900 dark:border-white"
                                      : "border-transparent hover:scale-110"
                                  }`}
                                />
                              ))}
                            </div>
                            {selectedRoom.color && canEdit && (
                              <button
                                type="button"
                                onClick={() => patchRoom({ color: undefined })}
                                className="mt-2 text-xs font-semibold text-stone-500 underline hover:text-stone-800 dark:text-slate-400"
                              >
                                Use the room type&rsquo;s colour
                              </button>
                            )}
                          </PanelField>
                        </>
                      )}

                      {selectedFurniture && (
                        <>
                          <PanelField label="Label">
                            <input
                              value={selectedFurniture.label ?? ""}
                              placeholder={FURNITURE_PRESETS[selectedFurniture.kind].label}
                              onChange={(e) =>
                                patchFurniture({ label: e.target.value || undefined })
                              }
                              maxLength={40}
                              disabled={!canEdit}
                              className={`w-full ${selectClass}`}
                            />
                          </PanelField>

                          <div className="grid grid-cols-2 gap-2">
                            <PanelField label="Width (ft)">
                              <NumberInput
                                value={selectedFurniture.widthFt}
                                disabled={!canEdit}
                                onCommit={(widthFt) => patchFurniture({ widthFt })}
                              />
                            </PanelField>
                            <PanelField label="Depth (ft)">
                              <NumberInput
                                value={selectedFurniture.depthFt}
                                disabled={!canEdit}
                                onCommit={(depthFt) => patchFurniture({ depthFt })}
                              />
                            </PanelField>
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={rotateFurniture}
                              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                            >
                              Rotate 90° · R
                            </button>
                          )}
                        </>
                      )}

                      {selectedWall && (
                        <>
                          <PanelField label="Length (ft)">
                            <NumberInput
                              value={Number(wallLengthFt(selectedWall).toFixed(2))}
                              disabled={!canEdit}
                              onCommit={(lengthFt) => resizeWall(selectedWall, lengthFt)}
                            />
                          </PanelField>

                          <PanelField label="Thickness">
                            <select
                              value={selectedWall.thicknessIn}
                              onChange={(e) =>
                                editFloor((f) => ({
                                  ...f,
                                  walls: f.walls.map((w) =>
                                    w.id === selectedId
                                      ? { ...w, thicknessIn: Number(e.target.value) }
                                      : w
                                  ),
                                }))
                              }
                              disabled={!canEdit}
                              className={`w-full ${selectClass}`}
                            >
                              <option value={5}>5&quot; partition</option>
                              <option value={10}>10&quot; exterior</option>
                            </select>
                          </PanelField>

                          <p className="text-[11px] text-stone-500 dark:text-slate-500">
                            The wall grows and shrinks from its far end. Its start point stays put,
                            so a run of walls stays joined.
                          </p>
                        </>
                      )}

                      {canEdit && selectedId && (
                        <button
                          type="button"
                          onClick={deleteSelected}
                          className="w-full rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
                        >
                          Delete element · Del
                        </button>
                      )}
                    </div>
                  )}
                </aside>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-slate-500">
                {canEdit && (
                  <span>
                    Ctrl-click grabs anything · Alt-drag pans · scroll zooms · 1-6 picks a tool ·
                    Ctrl+Z undoes · Del removes · R rotates · F fullscreen
                  </span>
                )}
                {savedBy[level] && <span>Last saved by {savedBy[level]}</span>}
              </div>
            </div>

            {!canEdit && (
              <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                Your architect draws the plan, you can view it here and raise anything you want
                changed in the project chat.
              </p>
            )}

            {compliance && <CompliancePanel compliance={compliance} areaName={project.areaName} />}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The headline for the properties panel: what is selected and how big it is.
 * Each kind of element measures differently, so this is the one place that
 * knows how to say each of them out loud.
 */
function describeSelection({
  room,
  furniture,
  wall,
  opening,
}: {
  room?: PlanRoom;
  furniture?: PlanFurniture;
  wall?: PlanWall;
  opening?: PlanOpening;
}): { title: string; subtitle: string } | null {
  if (room) {
    const rect = rectFromPoints(room.points);
    const area = `${Math.round(floorAreaSqft([room]))} sq ft`;
    return {
      title: room.name,
      subtitle: rect ? `${rect.widthFt} × ${rect.heightFt} ft · ${area}` : `${area} · irregular`,
    };
  }
  if (furniture) {
    return {
      title: furniture.label ?? FURNITURE_PRESETS[furniture.kind].label,
      subtitle: `${furniture.widthFt} × ${furniture.depthFt} ft · turned ${furniture.rotation}°`,
    };
  }
  if (wall) {
    return {
      title: "Wall",
      subtitle: `${formatFeet(wallLengthFt(wall))} long · ${wall.thicknessIn}" thick`,
    };
  }
  if (opening) {
    return {
      title: opening.kind === OpeningKind.DOOR ? "Door" : "Window",
      subtitle: `${opening.widthFt} ft wide`,
    };
  }
  return null;
}

/** One labelled control in the properties panel. */
function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold tracking-wider text-stone-500 uppercase dark:text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Width and height for a room — but only when the room is a rectangle standing
 * square to the sheet. An L-shaped or angled room has no single width to type,
 * so it gets its area instead.
 */
function RoomSize({
  room,
  canEdit,
  onResize,
}: {
  room: PlanRoom;
  canEdit: boolean;
  onResize: (room: PlanRoom, widthFt: number, heightFt: number) => void;
}) {
  const rect = rectFromPoints(room.points);
  if (!rect) {
    return (
      <PanelField label="Size">
        <p className="text-sm font-semibold">
          {Math.round(polygonArea(room))} sq ft · irregular shape
        </p>
      </PanelField>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <PanelField label="Width (ft)">
        <NumberInput
          value={rect.widthFt}
          disabled={!canEdit}
          onCommit={(w) => onResize(room, w, rect.heightFt)}
        />
      </PanelField>
      <PanelField label="Height (ft)">
        <NumberInput
          value={rect.heightFt}
          disabled={!canEdit}
          onCommit={(h) => onResize(room, rect.widthFt, h)}
        />
      </PanelField>
    </div>
  );
}

/** Area of one room — pulled out so RoomSize reads cleanly. */
function polygonArea(room: PlanRoom): number {
  return floorAreaSqft([room]);
}

/**
 * A number box that lets you type freely and only reports a value once it is
 * usable. A controlled `type="number"` bound straight to the geometry fights
 * back the moment you clear it to retype, because the empty string parses to
 * NaN and the shape collapses.
 */
function NumberInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // Follow the geometry when it changes from somewhere else — a drag, an undo,
  // or picking a different element — but not while the box is being typed in.
  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={0.5}
      step={0.5}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const next = Number(e.target.value);
        if (Number.isFinite(next) && next >= 0.5) onCommit(next);
      }}
      className={`w-full ${selectClass}`}
    />
  );
}

/**
 * Measures the drawn floors against the DAP zone rules stored in the database.
 * The numbers come back from the API so the check cannot drift from the
 * admin-editable limits, and so a stale browser tab can't report a pass.
 */
function CompliancePanel({
  compliance,
  areaName,
}: {
  compliance: PlanCompliance;
  areaName: string;
}) {
  const verdictStyles = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
    over: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300",
    "no-zone": "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-slate-300",
  } as const;

  const verdictLabel = {
    ok: "Within DAP limits",
    over: "Over the DAP limits",
    "no-zone": "No zone data",
  } as const;

  return (
    <div className="mt-5 border-t border-black/10 pt-5 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold">
          Zone check{compliance.zoneCode ? ` · ${compliance.zoneCode}` : ""}{" "}
          <span className="font-medium text-stone-500 dark:text-slate-500">({areaName})</span>
        </p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${verdictStyles[compliance.verdict]}`}
        >
          {verdictLabel[compliance.verdict]}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-500">Plot</dt>
          <dd className="mt-0.5 font-semibold">{compliance.plotAreaSqft.toLocaleString()} sq ft</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-500">Built area</dt>
          <dd className="mt-0.5 font-semibold">
            {compliance.totalBuiltAreaSqft.toLocaleString()} sq ft
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-500">FAR</dt>
          <dd className="mt-0.5 font-semibold">
            {compliance.far}
            {compliance.maxFar !== undefined && (
              <span className="font-medium text-stone-500 dark:text-slate-500">
                {" "}
                / {compliance.maxFar}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-500">Ground coverage</dt>
          <dd className="mt-0.5 font-semibold">
            {compliance.groundCoveragePct}%
            {compliance.maxGroundCoveragePct !== undefined && (
              <span className="font-medium text-stone-500 dark:text-slate-500">
                {" "}
                / {compliance.maxGroundCoveragePct}%
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* A bar each for the two limits that actually bind. */}
      {compliance.maxFar !== undefined && (
        <div className="mt-4 space-y-3">
          <LimitBar label="FAR" value={compliance.far} limit={compliance.maxFar} />
          {compliance.maxGroundCoveragePct !== undefined && (
            <LimitBar
              label="Ground coverage"
              value={compliance.groundCoveragePct}
              limit={compliance.maxGroundCoveragePct}
            />
          )}
        </div>
      )}

      {compliance.issues.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {compliance.issues.map((issue) => (
            <li key={issue} className="text-xs text-stone-600 dark:text-slate-400">
              • {issue}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
        Measured from the room outlines you drew. Furniture is not floor area, so it never moves
        these numbers. RAJUK counts gross covered area including walls, so treat this as a
        design-stage guide, not the formal submission figure.
      </p>
    </div>
  );
}

/** A limit as a bar: how much of the allowance the drawing has used. */
function LimitBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const used = limit > 0 ? (value / limit) * 100 : 0;
  const over = value > limit;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-stone-600 dark:text-slate-300">{label}</span>
        <span
          className={
            over
              ? "font-bold text-rose-600 dark:text-rose-400"
              : "text-stone-500 dark:text-slate-500"
          }
        >
          {Math.round(used)}% of allowance
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] ${over ? "bg-rose-500" : "bg-amber-400"}`}
          style={{ width: `${Math.min(100, used)}%` }}
        />
      </div>
    </div>
  );
}
