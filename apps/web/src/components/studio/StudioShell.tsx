"use client";

import { useEffect, useRef, useState } from "react";
import type { StudioDesign, StudioLoadResult, StudioVersionSummary } from "@buildora/shared";
import { deleteFloorPlan, listFloorPlans, saveFloorPlan } from "@/lib/apiFloorPlans";
import {
  askStudioAdvisor,
  getStudioVersion,
  loadStudio,
  saveStudio,
  saveStudioVersion,
} from "@/lib/apiStudio";
import { studioFloorToPlanInput, type StudioMirrorFloor } from "@/lib/studioToFloorPlan";
import type { ThemeMode } from "@/lib/frames";
import { useSession } from "@/store/useSession";
import { useTheme } from "@/store/useTheme";
import "./design3d.css";

/**
 * The BD Design Studio's markup, as JSX.
 *
 * This is `Essentials/design3d.html` line for line — same ids, same classes,
 * same SVG paths, same order — with only the conversions JSX forces: `class`
 * becomes `className`, `stroke-width` becomes `strokeWidth`, inline style
 * strings become objects, and `<input>` closes itself. React never touches any
 * of it after the first render: the engine owns this subtree and drives it
 * imperatively, exactly as it did when it owned a whole page.
 *
 * The component's own job is small — fetch the design, boot the engine, and
 * take it all down again on unmount.
 */
export function StudioShell({ projectId }: { projectId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The studio is a viewport-filling tool and the page behind it is not meant
   * to scroll while it is open — which is what the original's
   * `body{overflow:hidden}` did before its stylesheet was scoped.
   */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Loaded *before* the engine starts, for a reason worth stating: the
      // studio falls back to its sample villa when it finds nothing saved. If
      // a failed fetch were treated as "nothing saved", the sample would load
      // over a real design and the first autosave would write it to the
      // database. So a failed load is an error the studio never opens on.
      let seed: StudioLoadResult;
      try {
        seed = await loadStudio(projectId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open this project's design.");
        }
        return;
      }
      if (cancelled || !rootRef.current) return;

      // Dynamic, so three.js and the engine ship with this route alone and not
      // with every other page in the app.
      const { boot } = await import("./design3dEngine");
      if (cancelled || !rootRef.current) return;

      dispose = boot({
        root: rootRef.current,
        api: makeApi(projectId),
        canEdit: seed.canEdit,
        seed,
      });
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [projectId]);

  return (
    <div id="bds-root" ref={rootRef}>
      <div className="boot" id="boot">
        <div className="spin" style={{ width: "22px", height: "22px", borderWidth: "3px" }}></div>
        <div id="bootMsg">{error ?? "Loading the 3D engine…"}</div>
      </div>

      <div id="app">

        {/* ══════════ TOP BAR ══════════ */}
        <header className="topbar">
          <div className="brand"><div className="mark">A</div><span>Design Studio</span></div>
          <div className="vdiv"></div>
          <input id="projName" defaultValue="Modern Villa" spellCheck="false" />
          <span className="floor-chip" id="floorChip">Floor 1</span>

          <div className="tb-center">
            <button className="icon-btn" id="undoBtn" title="Undo (⌘Z)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>
            </button>
            <button className="icon-btn" id="redoBtn" title="Redo (⇧⌘Z)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>
            </button>
            <div className="vdiv"></div>
            <div className="seg" id="viewSeg">
              <button data-view="2d">2D</button>
              <button data-view="split">Split</button>
              <button data-view="3d" className="on">3D</button>
            </div>
          </div>

          <div className="tb-right">
            <span className="save-state" id="saveState">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
              <span id="saveTxt">All changes saved</span>
            </span>
            <button className="btn primary" id="saveBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              Save
            </button>
            {/* Day / night. Deliberately empty: the engine writes the sun or
                the moon into it on boot and on every flip, so there is one
                place that knows which mode is on rather than two. The boot
                overlay is still up while that first write happens. */}
            <button className="icon-btn" id="themeBtn" aria-label="Toggle day and night mode"></button>
            <button className="icon-btn" id="menuBtn" title="More">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
            </button>
          </div>

          <div className="menu" id="mainMenu">
            <div className="menu-t">Project</div>
            <button className="menu-i" data-act="new"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></span>New project</button>
            <button className="menu-i" data-act="importJson"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg></span>Import plan (JSON)</button>
            <button className="menu-i" data-act="sample"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></span>Load sample villa</button>
            <div className="menu-sep"></div>
            <div className="menu-t">Export</div>
            <button className="menu-i" data-act="glb"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.3L12 12l8.7-4.7M12 22V12"/></svg></span>glTF / GLB<span className="mk">.glb</span></button>
            <button className="menu-i" data-act="obj"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/></svg></span>Wavefront OBJ<span className="mk">.obj</span></button>
            <button className="menu-i" data-act="png3d"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>3D render image<span className="mk">.png</span></button>
            <button className="menu-i" data-act="png2d"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></span>Floor plan image<span className="mk">.png</span></button>
            <button className="menu-i" data-act="pdf"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/></svg></span>Floor plan sheet<span className="mk">PDF</span></button>
            <button className="menu-i" data-act="json"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>Project data<span className="mk">.json</span></button>
            <div className="menu-sep"></div>
            <button className="menu-i" data-act="shortcuts"><span className="mi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg></span>Keyboard shortcuts</button>
          </div>
        </header>

        {/* ══════════ WORKSPACE ══════════ */}
        <div className="workspace">

          <nav className="rail" id="rail"></nav>

          <main className="stage" id="stage">
            {/* 2D pane */}
            <div className="pane pane-2d" id="pane2d">
              <canvas id="c2d"></canvas>
              <div className="pane-tag">FLOOR PLAN</div>
              <div className="ov ov-tr ov-card ov-row" id="ov2d">
                <button className="ov-btn" id="btnGrid" title="Toggle grid">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                </button>
                <button className="ov-btn" id="btnDims" title="Toggle dimensions">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 8v8M21 8v8M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>
                </button>
                <button className="ov-btn" id="btnFit2d" title="Fit to view">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4"/></svg>
                </button>
              </div>
              <div className="ov ov-bl ov-card" style={{ padding: "0" }}><div className="stat-pill" id="stats2d"></div></div>
              <div className="ov ov-br ov-card ov-row" style={{ flexDirection: "column" }}>
                <button className="ov-btn" id="z2dIn">+</button>
                <button className="ov-btn" id="z2dOut">−</button>
              </div>
            </div>

            {/* 3D pane */}
            <div className="pane pane-3d" id="pane3d">
              <canvas id="c3d"></canvas>
              <div className="pane-tag" id="tag3d">3D VIEW</div>
              <div className="ov ov-tr ov-card ov-row" id="ov3d">
                <button className="ov-btn on" data-cam="orbit" title="Orbit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/></svg>
                </button>
                <button className="ov-btn" data-cam="iso" title="Isometric">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>
                </button>
                <button className="ov-btn" data-cam="top" title="Top view">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                </button>
                <div className="vdiv"></div>
                <button className="ov-btn" id="btnCeil" title="Show ceilings / roof">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M2 10l10-7 10 7"/><path d="M4 10v10h16V10"/></svg>
                </button>
                <button className="ov-btn on" id="btnShadow" title="Shadows">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" strokeLinecap="round"/></svg>
                </button>
                <button className="ov-btn" id="btnWalk" title="Walk through (first person)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="M11 21l1-6-3-3 1-5 4 3 3 1"/><path d="M9 12l-2 9"/></svg>
                </button>
              </div>
              <div className="ov ov-bc"><div className="hint-bar" id="hint">Pick a tool to start designing</div></div>
              <div className="ov ov-br ov-card ov-row">
                <button className="ov-btn" id="btnHome" title="Reset camera">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
                </button>
                <button className="ov-btn" id="btnFull" title="Focus 3D">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>
                </button>
              </div>
              <div className="walk-hud" id="walkHud">
                <div className="big">Walk mode</div>
                <div className="sm">Click to look around · W A S D to move · Shift to run · Esc to exit</div>
              </div>
            </div>
          </main>

          <aside className="panel">
            <div className="ptabs">
              <button className="ptab on" data-tab="props">Properties</button>
              <button className="ptab" data-tab="lib">Library</button>
              <button className="ptab" data-tab="layers">Layers</button>
              <button className="ptab" data-tab="ai">✦ AI</button>
            </div>
            <div className="pbody" id="tab-props"></div>
            <div className="pbody" id="tab-lib" style={{ display: "none" }}></div>
            <div className="pbody" id="tab-layers" style={{ display: "none" }}></div>
            <div className="pbody" id="tab-ai" style={{ display: "none" }}></div>
            <div className="ai-in" id="aiInRow" style={{ display: "none" }}>
              <textarea id="aiInput" rows={2} placeholder="Ask about layout, room sizes, BD building norms…"></textarea>
              <button className="btn primary" id="aiSend" style={{ width: "38px", padding: "0", justifyContent: "center" }}>➤</button>
            </div>
          </aside>
        </div>

        {/* ══════════ STATUS BAR ══════════ */}
        <footer className="statusbar">
          <button className="sb-btn on" id="sbSnapGrid" title="Snap to grid">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg> Grid snap
          </button>
          <button className="sb-btn on" id="sbSnapOrtho" title="Constrain to 0/45/90°">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 20V4M4 20h16M4 12h8v8"/></svg> Ortho
          </button>
          <button className="sb-btn on" id="sbSnapPoint" title="Snap to wall endpoints">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round"/></svg> Endpoint
          </button>
          <div className="sb-sep"></div>
          <button className="sb-btn" id="sbUnit">Units: <b id="unitLbl">ft</b></button>
          <div className="sb-sep"></div>
          <div className="sb-i">Grid <b id="gridLbl">1 ft</b></div>
          <div className="sb-right">
            <div className="sb-i" id="cursorPos">—</div>
            <div className="sb-sep"></div>
            <div className="sb-i">Floor area <b id="sbArea">0 ft²</b></div>
            <div className="sb-i">Volume <b id="sbVol">0 ft³</b></div>
            <div className="sb-sep"></div>
            <div className="sb-i"><span className="dotlive"></span> Real-time 3D</div>
          </div>
        </footer>
      </div>

      <div className="scrim" id="scrim"><div className="modal" id="modal"></div></div>
      <div className="toast" id="toast"></div>
      <input type="file" id="fileIn" accept=".json" style={{ display: "none" }} />
    </div>
  );
}

/**
 * Everything the engine is allowed to reach out of its own subtree through.
 *
 * Handing it one object of plain functions keeps React, the stores and the
 * endpoint paths out of the engine entirely — it asks for a save and does not
 * know or care that a save is an HTTP request against a project it has never
 * heard of, and it asks for night mode without knowing what holds the theme.
 */
function makeApi(projectId: string) {
  const mirror = makeMirror(projectId);
  return {
    save: (design: StudioDesign, unloading?: boolean) =>
      saveStudio(projectId, design, unloading),
    saveVersion: (version: StudioVersionSummary & { design: StudioDesign }) =>
      saveStudioVersion(projectId, version),
    getVersion: (versionId: string) => getStudioVersion(projectId, versionId),
    advise: (
      system: string,
      grounding: string,
      messages: { role: "user" | "assistant"; content: string }[]
    ) => askStudioAdvisor(projectId, system, grounding, messages),
    // The studio's day/night button flips the *whole app*, so it goes through
    // the store the navbar's toggle already uses rather than touching the
    // `dark` class itself. `useTheme` seeds its state from the class once, at
    // module load — so a studio that set the class directly would leave that
    // state stale, and the next press of the navbar toggle would compute the
    // wrong mode and appear to do nothing.
    setTheme: (mode: ThemeMode) => useTheme.getState().setMode(mode),
    mirror,
  };
}

/**
 * Keeps Buildora's floor plans in step with the design.
 *
 * The FAR check, the cost estimate and the Bill of Quantities all measure
 * `FloorPlan` documents. The studio saves designs. This translates one into the
 * other after each save, through the floor-plan endpoint that already exists —
 * so nothing downstream had to change, and there is still only one place a
 * building gets drawn.
 *
 * Closes over the last payload it sent so an unchanged level is not rewritten:
 * every floor-plan save recomputes compliance and refreshes the owner's
 * estimate, and a five-second timer firing through a long drawing session would
 * otherwise do all of that work for floors nobody has touched.
 */
function makeMirror(projectId: string) {
  const sent = new Map<number, string>();
  let lastFloorCount = -1;

  return async function mirror(floors: StudioMirrorFloor[]) {
    const token = useSession.getState().token;
    if (!token) return;

    for (const floor of floors) {
      const input = studioFloorToPlanInput(floor);
      const body = JSON.stringify(input);
      if (sent.get(floor.level) === body) continue;
      await saveFloorPlan(token, projectId, input);
      sent.set(floor.level, body);
    }

    // Deleting a level in the studio has to delete its plan too, or the FAR
    // check would keep counting a floor that no longer exists. Only worth
    // looking when the building actually got shorter.
    if (lastFloorCount > floors.length || lastFloorCount === -1) {
      const { plans } = await listFloorPlans(token, projectId);
      for (const plan of plans) {
        if (plan.level < floors.length) continue;
        await deleteFloorPlan(token, projectId, plan.level);
        sent.delete(plan.level);
      }
    }
    lastFloorCount = floors.length;
  };
}
