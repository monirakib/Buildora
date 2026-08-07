"use client";

import { useEffect, useRef, useState } from "react";
import {
  floorLabel,
  kathaToSqft,
  type PlanCompliance,
  type PlanOpening,
  type PlanRoom,
  type PlanWall,
  type Project,
} from "@buildora/shared";
import { deleteFloorPlan, listFloorPlans, saveFloorPlan } from "@/lib/apiFloorPlans";
import { PlanCanvas, type PlanTool } from "./PlanCanvas";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const selectClass =
  "rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-900 outline-none transition focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

/** Everything the editor holds for one floor. */
interface PlanGeometry {
  walls: PlanWall[];
  rooms: PlanRoom[];
  openings: PlanOpening[];
  gridStepFt: number;
}

const emptyFloor: PlanGeometry = { walls: [], rooms: [], openings: [], gridStepFt: 1 };

const tools: { id: PlanTool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Click a wall, room, or opening to select it" },
  { id: "wall", label: "Wall", hint: "Click to start, click again to end — walls chain on" },
  { id: "room", label: "Room", hint: "Click two opposite corners to box a room" },
  { id: "door", label: "Door", hint: "Click on a wall to cut a door into it" },
  { id: "window", label: "Window", hint: "Click on a wall to cut a window into it" },
];

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
].join(";");

/**
 * The 2D floor-plan builder — the layout drawn before any 3D model exists.
 *
 * One floor is edited at a time (tabs across the top), each stored as its own
 * record. Every edit stays in memory until "Save floor" is pressed, so drawing
 * never blocks on the network; switching floors keeps unsaved work in state and
 * flags the tab with a dot.
 */
export function FloorPlanSection({
  project,
  token,
}: {
  project: Project;
  token: string;
}) {
  // Geometry per level, so switching tabs does not lose unsaved work.
  const [floors, setFloors] = useState<Record<number, PlanGeometry>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [level, setLevel] = useState(0);
  const [compliance, setCompliance] = useState<PlanCompliance | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [savedBy, setSavedBy] = useState<Record<number, string>>({});

  const [tool, setTool] = useState<PlanTool>("select");
  const [ortho, setOrtho] = useState(true);
  const [wallThicknessIn, setWallThicknessIn] = useState(10);
  const [openingWidthFt, setOpeningWidthFt] = useState(3);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped whenever the floor's geometry is thrown away wholesale. The canvas
  // keeps the pending start point of a wall run in its own state, and that
  // point has to go with the walls it belonged to. See the canvas `key` below.
  const [resetToken, setResetToken] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Tabs for every floor the brief asked for — at least a ground floor.
  const levels = Array.from({ length: Math.max(1, project.floors) }, (_, i) => i);
  const plan = floors[level] ?? emptyFloor;

  // Size the sheet from the plot: a square-ish plot of this area, with room to
  // draw around it. Rounded up to 10 ft so the 5 ft major grid stays whole.
  const plotSideFt = Math.sqrt(kathaToSqft(project.landAreaKatha));
  const widthFt = Math.max(40, Math.ceil((plotSideFt * 1.3) / 10) * 10);
  const heightFt = Math.round(widthFt * 0.75);

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
            gridStepFt: p.gridStepFt,
          };
          if (p.updatedBy) editors[p.level] = p.updatedBy.name;
        }
        setFloors(loaded);
        setSavedBy(editors);
        setCompliance(result.compliance);
        setCanEdit(result.canEdit);
        if (result.canEdit) setTool("wall");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the floor plans");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, project.id]);

  /** Apply a change to the active floor and mark it unsaved. */
  function editFloor(change: (current: PlanGeometry) => PlanGeometry) {
    setFloors((all) => ({ ...all, [level]: change(all[level] ?? emptyFloor) }));
    setDirty((all) => ({ ...all, [level]: true }));
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
    }));
    setSelectedId(null);
  }

  function renameRoom(name: string) {
    editFloor((f) => ({
      ...f,
      rooms: f.rooms.map((r) => (r.id === selectedId ? { ...r, name } : r)),
    }));
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
   * Export the sheet as a PNG: clone the live SVG, strip the drawing helpers,
   * swap in print colours, then paint it into a canvas at 20 px per foot and
   * download the result.
   */
  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-transient]").forEach((el) => el.remove());
    clone.setAttribute("style", PRINT_PALETTE);

    const pxPerFoot = 20;
    const pixelWidth = widthFt * pxPerFoot;
    const pixelHeight = heightFt * pxPerFoot;
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

  const selectedRoom = plan.rooms.find((r) => r.id === selectedId);
  const activeHint = tools.find((t) => t.id === tool)?.hint;

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
            {/* Floor tabs — one per floor in the brief, stacked ground-up. */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Floors">
              {levels.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={l === level}
                  onClick={() => {
                    setLevel(l);
                    setSelectedId(null);
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    l === level
                      ? "bg-amber-400 text-stone-950"
                      : "border border-stone-300 text-stone-600 hover:border-amber-400 dark:border-white/15 dark:text-slate-300"
                  }`}
                >
                  {floorLabel(l)}
                  {dirty[l] && <span className="ml-1.5 text-amber-700 dark:text-amber-500">•</span>}
                </button>
              ))}
            </div>

            {/* Toolbar — hidden entirely for the land owner, who reads only. */}
            {canEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {tools.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTool(t.id);
                      setSelectedId(null);
                      // Windows are wider than doors by default.
                      if (t.id === "window") setOpeningWidthFt(4);
                      if (t.id === "door") setOpeningWidthFt(3);
                    }}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                      t.id === tool
                        ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                        : "border border-stone-300 text-stone-600 hover:border-stone-500 dark:border-white/15 dark:text-slate-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}

                <span className="mx-1 h-6 w-px bg-black/10 dark:bg-white/15" />

                <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={ortho}
                    onChange={(e) => setOrtho(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  Straight walls only
                </label>

                <select
                  value={plan.gridStepFt}
                  onChange={(e) =>
                    editFloor((f) => ({ ...f, gridStepFt: Number(e.target.value) }))
                  }
                  className={selectClass}
                  aria-label="Grid step"
                >
                  <option value={0.5}>6&quot; grid</option>
                  <option value={1}>1 ft grid</option>
                  <option value={2}>2 ft grid</option>
                </select>

                {(tool === "wall" || tool === "select") && (
                  <select
                    value={wallThicknessIn}
                    onChange={(e) => setWallThicknessIn(Number(e.target.value))}
                    className={selectClass}
                    aria-label="Wall thickness"
                  >
                    <option value={5}>5&quot; partition</option>
                    <option value={10}>10&quot; exterior</option>
                  </select>
                )}

                {(tool === "door" || tool === "window") && (
                  <select
                    value={openingWidthFt}
                    onChange={(e) => setOpeningWidthFt(Number(e.target.value))}
                    className={selectClass}
                    aria-label="Opening width"
                  >
                    {[2.5, 3, 3.5, 4, 5, 6].map((w) => (
                      <option key={w} value={w}>
                        {w} ft wide
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {canEdit && activeHint && (
              <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                {activeHint}
                {tool === "wall" && " · Esc ends the run"}
              </p>
            )}

            {/* The drawing itself */}
            <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
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
                gridStepFt={plan.gridStepFt}
                widthFt={widthFt}
                heightFt={heightFt}
                tool={canEdit ? tool : "select"}
                ortho={ortho}
                readOnly={!canEdit}
                wallThicknessIn={wallThicknessIn}
                openingWidthFt={openingWidthFt}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddWall={addWall}
                onAddRoom={addRoom}
                onAddOpening={addOpening}
                svgRef={svgRef}
              />
            </div>

            {/* What is selected, and what can be done to it */}
            {canEdit && selectedId && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectedRoom && (
                  <input
                    value={selectedRoom.name}
                    onChange={(e) => renameRoom(e.target.value)}
                    maxLength={40}
                    aria-label="Room name"
                    className={selectClass}
                  />
                )}
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="rounded-full border border-rose-300 px-4 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
                >
                  Delete selected
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !dirty[level]}
                    className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {busy ? "Saving…" : dirty[level] ? "Save floor" : "Saved"}
                  </button>
                  <button
                    type="button"
                    onClick={clearFloor}
                    disabled={busy}
                    className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    Clear floor
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={exportPng}
                className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Export PNG
              </button>
              {savedBy[level] && (
                <span className="text-xs text-stone-500 dark:text-slate-500">
                  Last saved by {savedBy[level]}
                </span>
              )}
            </div>

            {!canEdit && (
              <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                Your architect draws the plan — you can view it here and raise anything you want
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
          <dd className="mt-0.5 font-semibold">
            {compliance.plotAreaSqft.toLocaleString()} sq ft
          </dd>
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
              — {issue}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
        Measured from the room outlines you drew. RAJUK counts gross covered area including walls,
        so treat this as a design-stage guide, not the formal submission figure.
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
        <span className={over ? "font-bold text-rose-600 dark:text-rose-400" : "text-stone-500 dark:text-slate-500"}>
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
