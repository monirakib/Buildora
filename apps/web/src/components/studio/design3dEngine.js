/**
 * BD Design Studio — the engine from `Essentials/design3d.html`.
 *
 * This is the standalone tool's script, kept as it was written. It is plain
 * JavaScript rather than TypeScript, and its own indentation rather than the
 * repo's, for one reason: every line of it has to stay recognisable against the
 * file it came from. Retyping three and a half thousand lines into a different
 * language is how a working 3D designer quietly stops working.
 *
 * Eight things were changed, and nothing else:
 *
 *  1. three.js is imported from npm instead of a CDN import map.
 *  2. `$` and `$$` query the mounted root instead of the document, which scopes
 *     every lookup in the file without touching any of them.
 *  3. Autosave and versions go to the project in MongoDB instead of
 *     localStorage, and each save is mirrored into Buildora's floor plans.
 *  4. The ✦ AI tab asks Buildora's existing advisor endpoint instead of a
 *     throwaway Node server.
 *  5. Window-level listeners go through `on()` so `dispose()` can take them off
 *     again — this is a single-page app now, and unmounting is not a reload.
 *  6. The render loop keeps its frame handle so it can be stopped.
 *  7. A read-only chip, for people who can see the design but not edit it.
 *  8. The colours and the canvas typeface, so the drawing matches Buildora's
 *     skin rather than the blue-and-grey one it shipped with — and then a
 *     day/night mode on top of that. Every colour the two canvases paint with
 *     moved out of the drawing code and into the `THEMES` table below, which
 *     `applyTheme()` swaps; the canvas font strings now name `--font-manrope`
 *     instead of Inter. Nothing about geometry, hit-testing or the model
 *     changed — see `design3d.css` for the same treatment applied to the
 *     chrome, which is the other half of the same switch.
 *
 * Everything above the horizontal rule below is new. Under it is the original
 * file, with the colour and font literals of point 8 replaced by `PAL.*` and
 * `UI_FONT` in place — plus `buildGrids()`, `applyTheme()` and `onDayPaper()`,
 * which exist only because a theme can now change while the tool is open.
 *
 * @see apps/web/src/components/studio/StudioShell.tsx — the markup it drives
 * @see apps/web/src/components/studio/design3d.css   — the studio's skin
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

/**
 * Start the studio inside `root` and return the function that shuts it down.
 *
 * @param {object}      opts
 * @param {HTMLElement} opts.root    the element holding the studio's markup
 * @param {object}      opts.api     save / versions / advice / mirror / setTheme
 * @param {boolean}     opts.canEdit false makes the whole tool read-only
 * @param {object|null} opts.seed    `{ design, versions }` already fetched
 * @returns {() => void} dispose
 */
export function boot({ root, api, canEdit, seed }) {

// Scoped in place of `document.querySelector`. The studio's markup all lives
// under one element, so this one substitution keeps roughly two hundred lookups
// inside it — including #toast, #scrim and #fileIn, which sit beside #app.
const $  = s => root.querySelector(s);
const $$ = s => [...root.querySelectorAll(s)];

// Bookkeeping for teardown. Anything attached to the window, the render loop
// and the WebGL context all have to be released when the route unmounts, and
// Next runs effects twice in development, so a half-hearted teardown shows up
// immediately as a second leaked context.
const off = [];
const on = (target, type, fn, opts) => {
  target.addEventListener(type, fn, opts);
  off.push(() => target.removeEventListener(type, fn, opts));
};
let rafId = 0;
let stageObserver = null;
// Requests in flight when the studio closes must not touch a torn-down scene.
let disposed = false;

// The site's typeface, for the text the studio paints onto its own canvases —
// room names, dimension badges, the rulers, the 3D labels. Canvas takes a font
// string rather than a class, so the family name is read out of the
// `--font-manrope` custom property next/font sets on <html>. That is the same
// generated name the stylesheet resolves, so the drawing and the chrome around
// it end up in one typeface instead of two.
const UI_FONT = (getComputedStyle(document.documentElement)
  .getPropertyValue('--font-manrope') || '').trim() || 'system-ui';

// ── Theme ─────────────────────────────────────────────────────────
// A <canvas> has no stylesheet, so the half of the studio's skin that lives in
// JavaScript lives here. `design3d.css` paints the chrome from CSS variables;
// this table paints the two drawing surfaces, and `applyTheme()` below is what
// keeps the two in step. Which mode we are in is never stored twice: it is the
// `dark` class on <html>, the same flag the pre-hydration script in layout.tsx
// sets and `store/useTheme` writes.
//
// Day is the palette the tool was drawn in. Night follows the convention every
// 3D and CAD tool uses — the *surroundings* go dark and the building stays lit,
// because dimming the lights as well would only make the model unreadable. So
// the scene background, ground, grids and 2D paper flip; the sun does not.
const THEMES = {
  day: {
    paper:'#faf8f3', gridMinor:'#ece7dd', gridMajor:'#e0d9cb', axis:'#c9c0ae',
    wall:'#1c1917', sel:'#d97706', hov:'#f59e0b',
    measure:'#dc2626', measureSoft:'rgba(220,38,38,.35)',
    roomName:'#44403c', faint:'#a8a29e', ink2:'#57534e',
    roomSel:'rgba(245,158,11,.32)',
    door:'#57534e', window:'#0f766e',
    furn:'#78716c', furnFill:'rgba(120,113,108,.12)',
    selFill:'rgba(217,119,6,.16)', ghostFill:'rgba(217,119,6,.12)',
    badgeFg:'#ffffff', rug:'rgba(190,180,160,.18)',
    rulerBg:'rgba(255,255,255,.94)', rulerLine:'#e7e2d8', rulerTick:'#e0dace',
    labelBg:'rgba(255,255,255,.92)', labelFg:'#1c1917', labelLine:'#e7e5e4',
    tints:{
      Bedroom:'#f4ead6', Living:'#e7f0e4', 'Living / Dining':'#e7f0e4', Kitchen:'#fae7d7',
      Bath:'#e4eef2', Dining:'#eff0dc', Balcony:'#e5f1ed', Corridor:'#f0ece4', Store:'#efe8dc'
    },
    tint:'#f2eee6',
    scene:0xf5f2ec, ground:0xece7de, hemiGround:0xe6e0d3,
    gridA:0xdcd5c7, gridB:0xe6e0d3, gridC:0xbfb5a2, gridD:0xd2cabb, sel3d:0xd97706
  },
  night: {
    paper:'#0c1424', gridMinor:'#182337', gridMajor:'#22304a', axis:'#33415e',
    wall:'#e2e8f0', sel:'#fbbf24', hov:'#fcd34d',
    measure:'#f87171', measureSoft:'rgba(248,113,113,.35)',
    roomName:'#e2e8f0', faint:'#7c8ba1', ink2:'#94a3b8',
    roomSel:'rgba(251,191,36,.3)',
    door:'#94a3b8', window:'#2dd4bf',
    furn:'#94a3b8', furnFill:'rgba(148,163,184,.14)',
    selFill:'rgba(251,191,36,.18)', ghostFill:'rgba(251,191,36,.14)',
    // Badges are amber-400 at night, so their text goes dark — the same pairing
    // the site uses for every amber button.
    badgeFg:'#1c1917', rug:'rgba(148,163,184,.16)',
    rulerBg:'rgba(12,20,36,.94)', rulerLine:'#1e293b', rulerTick:'#1e293b',
    labelBg:'rgba(15,23,42,.92)', labelFg:'#e2e8f0', labelLine:'rgba(255,255,255,.16)',
    // The room tints are the day hues at low alpha rather than a second set
    // picked by hand: over the dark paper that keeps every room the colour it
    // already was, only quiet enough to read as a tint instead of a light box.
    tints:{
      Bedroom:'rgba(244,234,214,.12)', Living:'rgba(231,240,228,.12)',
      'Living / Dining':'rgba(231,240,228,.12)', Kitchen:'rgba(250,231,215,.12)',
      Bath:'rgba(228,238,242,.12)', Dining:'rgba(239,240,220,.12)',
      Balcony:'rgba(229,241,237,.12)', Corridor:'rgba(240,236,228,.1)',
      Store:'rgba(239,232,220,.1)'
    },
    tint:'rgba(242,238,230,.1)',
    scene:0x0d1526, ground:0x131c2e, hemiGround:0x1b2437,
    gridA:0x24304a, gridB:0x1b2437, gridC:0x3a4763, gridD:0x2b3550, sel3d:0xfbbf24
  }
};
const themeMode = () => document.documentElement.classList.contains('dark') ? 'night' : 'day';
// Read once here so every `const` further down that bakes in a colour — the
// scene background, the selection materials — starts in the right mode without
// a repaint on boot.
let PAL = THEMES[themeMode()];

// ──────────────────────────────────────────────────────────────────
//  Below this line: Essentials/design3d.html — unchanged but for the colour
//  and font literals noted in point 8 of the header.
// ──────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
//  CORE — units, project model, history, persistence
//  Internal unit is FEET everywhere (same as the 2D designer in f.html).
//  Display unit is switchable (ft / m).
// ══════════════════════════════════════════════════════════════════
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2,10);
const FT_PER_M = 3.280839895;

const U = {
  unit: 'ft',
  toDisp(ft){ return this.unit === 'm' ? ft / FT_PER_M : ft; },
  fromDisp(v){ return this.unit === 'm' ? v * FT_PER_M : v; },
  fmt(ft, dp){
    const v = this.toDisp(ft);
    const d = dp !== undefined ? dp : (this.unit === 'm' ? 2 : 1);
    return v.toFixed(d).replace(/\.0+$/,'') + ' ' + this.unit;
  },
  fmtArea(sqft){
    return this.unit === 'm'
      ? (sqft / (FT_PER_M**2)).toFixed(1) + ' m²'
      : Math.round(sqft) + ' ft²';
  },
  fmtVol(cuft){
    return this.unit === 'm'
      ? (cuft / (FT_PER_M**3)).toFixed(1) + ' m³'
      : Math.round(cuft) + ' ft³';
  }
};

// ── Defaults tuned to Bangladeshi apartment practice (feet) ────────
const DEF = {
  wallH: 9.5,        // typical Dhaka floor-to-ceiling
  wallT: 0.42,       // 5" brick + plaster
  extWallT: 0.83,    // 10" exterior brick
  doorW: 3.0, doorH: 7.0,
  winW: 4.0, winH: 4.0, winSill: 3.0,
  slabT: 0.5,
  floorH: 10.5       // floor-to-floor
};

function newFloor(i){
  return {
    id: uid(),
    name: 'Floor ' + (i + 1),
    note: i === 0 ? 'Ground level' : '',
    elevation: i * DEF.floorH,
    height: DEF.wallH,
    visible: true,
    floorMat: 'oak',
    ceilMat: 'plaster',
    elements: [],
    roomMeta: []          // {c:[x,z], name, mat} — matched to detected rooms by centroid
  };
}

function newProject(name){
  return { name: name || 'Modern Villa', unit: 'ft', floors: [newFloor(0)], active: 0, v: 1 };
}

let P = newProject();                 // the project
let sel = null;                       // selected element id
let hover = null;                     // hovered element id (2D)
let tool = 'select';
let viewMode = '3d';                  // 2d | split | 3d
const snapCfg = { grid: true, ortho: true, point: true, size: 1 };
const showCfg = { grid: true, dims: true, ceilings: false, shadows: true, above: false };

const floor  = () => P.floors[P.active];
const els    = () => floor().elements;
const byId   = id => { for (const f of P.floors) { const e = f.elements.find(e => e.id === id); if (e) return e; } return null; };
const selEl  = () => sel ? byId(sel) : null;

// ── History ───────────────────────────────────────────────────────
const H = { past: [], future: [], last: null };
function snapshot(){ return JSON.stringify({ floors: P.floors, active: P.active, name: P.name }); }
function commit(){                        // call AFTER a mutation
  if (H.last !== null) { H.past.push(H.last); if (H.past.length > 80) H.past.shift(); }
  H.last = snapshot();
  H.future.length = 0;
  markDirty(); refreshAll();
}
function beginChange(){ H.last = H.last === null ? snapshot() : H.last; }
function restore(js){
  const d = JSON.parse(js);
  const keep = sel;
  P.floors = d.floors; P.active = Math.min(d.active, d.floors.length - 1); P.name = d.name;
  $('#projName').value = P.name;
  sel = (keep && byId(keep)) ? keep : null;   // keep the selection if it survived
  refreshAll();
}
function undo(){
  if (!H.past.length) return;
  H.future.push(snapshot());
  restore(H.past.pop());
  H.last = snapshot(); markDirty();
  toast('Undo');
}
function redo(){
  if (!H.future.length) return;
  H.past.push(snapshot());
  restore(H.future.pop());
  H.last = snapshot(); markDirty();
  toast('Redo');
}

// ── Persistence: autosave + manual named versions ─────────────────
// The standalone tool kept both of these in localStorage. Inside Buildora they
// belong to the project, so a design opens on whatever machine the architect
// signs in from and the owner can see what was drawn. Everything around the
// storage call is unchanged: the same 500 ms debounce, the same "Unsaved
// changes" chip, the same flush when the tab goes away, the same cap of twelve
// versions.
let dirty = false, saveTimer = null;
// The last failure reason shown, so a retry loop doesn't repeat itself.
let lastSaveError = null;
// The version list is held here rather than fetched on demand because
// renderLayers() draws it synchronously. It is seeded from the load and then
// replaced by whatever the server says after each save.
let verList = (seed && seed.versions) || [];

function markDirty(){
  // An owner opening the design reads it; only the engaged architect writes.
  if (!canEdit) return;
  dirty = true;
  $('#saveTxt').textContent = 'Unsaved changes';
  $('#saveState').classList.add('dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 500);
}
// Autosave is debounced, so a reload or a closed tab could land inside that
// window and lose the last edit. Flush it whenever the page goes away.
// `true` marks this as the save on the way out, which needs a request the
// browser will finish after the document is gone.
function flushSave(){ if (dirty){ clearTimeout(saveTimer); autosave(true); } }
on(window, 'beforeunload', flushSave);
on(window, 'pagehide', flushSave);
on(window, 'visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function autosave(unloading){
  if (!canEdit || disposed) return;
  P.name = $('#projName').value || 'Untitled';
  // Serialised now, not when the request goes out: the drawing carries on
  // while the save is in flight and the two must not share objects.
  const snap = JSON.parse(JSON.stringify(P));
  // Cleared optimistically. An edit made during the request sets it again and
  // schedules the next save, which is what makes the chip honest.
  dirty = false;
  api.save(snap, unloading === true).then(() => {
    if (disposed) return;
    lastSaveError = null;
    $('#saveState').title = '';
    scheduleMirror();
    if (!dirty){
      $('#saveTxt').textContent = 'All changes saved';
      $('#saveState').classList.remove('dirty');
    }
  }).catch(err => {
    if (disposed) return;
    dirty = true;
    $('#saveTxt').textContent = 'Autosave failed';
    // Say *why*. A save that keeps failing with nothing but "Autosave failed"
    // is a drawing session spent guessing, so the server's reason goes on the
    // chip to hover over and is announced once per new reason — once, because
    // this retries every four seconds and a toast per attempt would be worse
    // than saying nothing.
    const why = (err && err.message) || 'Could not reach the server.';
    $('#saveState').title = why;
    if (why !== lastSaveError){ lastSaveError = why; toast('Save failed — ' + why); }
    // Storage used to be a function call that either worked or didn't. It is a
    // network now, so a failure is usually temporary — try again rather than
    // leaving the work sitting in a tab with a red label on it.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 4000);
  });
}
function loadAutosave(){
  // Fetched by the React shell before the engine boots, so this stays
  // synchronous and init() runs in exactly the order it always did.
  const d = seed && seed.design;
  if (!d || !d.floors || !d.floors.length) return false;
  P = Object.assign(newProject(), d);
  P.floors.forEach(f => { f.roomMeta = f.roomMeta || []; f.elements = f.elements || []; });
  P.active = clamp(P.active || 0, 0, P.floors.length - 1);
  return true;
}

// ── The mirror into Buildora's floor plans ────────────────────────
// The FAR check, the cost estimate and the Bill of Quantities all measure
// FloorPlan documents, not designs. Rather than teach them a second geometry
// format, each save is followed by a translation of every level — see
// lib/studioToFloorPlan.ts.
//
// On its own timer, and a much slower one. Rooms are re-detected from the wall
// graph to build it, which is real work, and nothing downstream needs a built
// area that is five seconds fresher.
let mirrorTimer = null;
function scheduleMirror(){
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(sendMirror, 5000);
}
function sendMirror(){
  if (!canEdit || disposed) return;
  // detectRooms reads the active floor, so each level is made active in turn —
  // the same dance renderLayers does to total up the areas per level.
  const savedActive = P.active;
  let payload;
  try {
    payload = P.floors.map((f, i) => {
      P.active = i;
      return {
        level: i,
        height: f.height,
        floorMat: f.floorMat,
        ceilMat: f.ceilMat,
        showCeiling: showCfg.ceilings,
        gridStepFt: snapCfg.size,
        elements: f.elements,
        rooms: detectRooms(f).map(r => ({ poly: r.poly, area: r.area, name: r.name }))
      };
    });
  } finally { P.active = savedActive; }
  // Deliberately silent. The design is already saved by this point, and a
  // failed mirror means a stale figure on the project page, not lost work.
  api.mirror(payload).catch(() => {});
}

function versions(){ return verList; }
function saveVersion(label){
  if (!canEdit){ toast('You have read-only access to this design'); return; }
  const v = {
    id: uid(),
    label: label || (P.name + ' — ' + new Date().toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})),
    at: Date.now(),
    thumb: thumbnail(),
    design: JSON.parse(JSON.stringify(P))
  };
  // Shown straight away and confirmed after: saving a version is a deliberate
  // act and the list should react to it, not lag a round trip behind.
  verList = [{ id: v.id, label: v.label, at: v.at, thumb: v.thumb }, ...verList].slice(0, 12);
  autosave();
  toast('Version saved');
  if (activeTab === 'layers') renderLayers();
  api.saveVersion(v).then(list => {
    if (disposed) return;
    verList = list;
    if (activeTab === 'layers') renderLayers();
  }).catch(err => {
    if (disposed) return;
    toast('Could not save that version — ' + ((err && err.message) || 'no reply from the server'));
  });
}

// ── UI utilities ──────────────────────────────────────────────────
let toastT = null;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000);
}
function openModal(html, onMount){
  $('#modal').innerHTML = html;
  $('#scrim').classList.add('on');
  $$('#modal [data-close]').forEach(b => b.onclick = closeModal);
  if (onMount) onMount($('#modal'));
}
function closeModal(){ $('#scrim').classList.remove('on'); }
$('#scrim').addEventListener('mousedown', e => { if (e.target.id === 'scrim') closeModal(); });

function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ══════════════════════════════════════════════════════════════════
//  TOPOLOGY — wall graph, automatic room detection, snapping
//  Plan coordinates are (x, z): x → right, z → "down" on the plan,
//  which maps directly onto the 3D ground plane.
// ══════════════════════════════════════════════════════════════════
const EPS = 1e-6;
const V = {
  sub: (a,b) => [a[0]-b[0], a[1]-b[1]],
  add: (a,b) => [a[0]+b[0], a[1]+b[1]],
  mul: (a,s) => [a[0]*s, a[1]*s],
  len: a => Math.hypot(a[0], a[1]),
  dist: (a,b) => Math.hypot(b[0]-a[0], b[1]-a[1]),
  norm: a => { const l = Math.hypot(a[0],a[1]) || 1; return [a[0]/l, a[1]/l]; },
  perp: a => [-a[1], a[0]],
  dot: (a,b) => a[0]*b[0] + a[1]*b[1],
  lerp: (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]
};

const walls = f => (f || floor()).elements.filter(e => e.type === 'wall');
const wallLen = w => V.dist(w.a, w.b);
const wallDir = w => V.norm(V.sub(w.b, w.a));
const wallAngle = w => Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
// openings live on the same floor as their host wall — search every floor,
// element ids are unique across the project
function openingsOf(wid){
  const out = [];
  for (const f of P.floors)
    for (const e of f.elements)
      if ((e.type === 'door' || e.type === 'window') && e.host === wid) out.push(e);
  return out;
}
const floorOf = el => P.floors.find(f => f.elements.includes(el)) || floor();

// distance from point to segment, plus the parameter t along it
function projSeg(p, a, b){
  const ab = V.sub(b,a), L2 = V.dot(ab,ab);
  if (L2 < EPS) return { t:0, d:V.dist(p,a), pt:a.slice() };
  let t = V.dot(V.sub(p,a), ab) / L2;
  t = clamp(t, 0, 1);
  const pt = V.lerp(a, b, t);
  return { t, d: V.dist(p, pt), pt };
}

// ── Snapping ──────────────────────────────────────────────────────
// Returns a snapped plan point + a marker describing what it locked onto.
// `skip` is a Set of wall ids to ignore as snap targets — the walls currently
// being dragged, which would otherwise snap back onto themselves.
function snapPoint(p, from, skip){
  let out = p.slice(), kind = null;

  // 1. endpoint / midpoint of existing walls wins over everything
  if (snapCfg.point){
    let best = null, bd = 0.9;
    for (const w of walls()){
      if (skip && skip.has(w.id)) continue;
      for (const c of [w.a, w.b, V.lerp(w.a, w.b, .5)]){
        const d = V.dist(p, c);
        if (d < bd){ bd = d; best = c; }
      }
    }
    if (best){ return { p: best.slice(), kind: 'point' }; }
  }

  // 2. direction constraint from the previous point (0/45/90°)
  if (from && snapCfg.ortho){
    const d = V.sub(p, from), L = V.len(d);
    if (L > EPS){
      const a = Math.atan2(d[1], d[0]);
      const step = Math.PI / 4;
      const sa = Math.round(a / step) * step;
      if (Math.abs(((a - sa + Math.PI) % (2*Math.PI)) - Math.PI) < 0.35){
        out = [from[0] + Math.cos(sa)*L, from[1] + Math.sin(sa)*L];
        kind = 'ortho';
      }
    }
  }

  // 3. grid
  if (snapCfg.grid){
    const g = snapCfg.size;
    if (kind === 'ortho' && from){
      // keep the constrained direction, quantise the length instead
      const d = V.sub(out, from), L = Math.max(g, Math.round(V.len(d)/g)*g), n = V.norm(d);
      out = [from[0] + n[0]*L, from[1] + n[1]*L];
    } else {
      out = [Math.round(out[0]/g)*g, Math.round(out[1]/g)*g];
      kind = kind || 'grid';
    }
  }
  return { p: out, kind };
}

// nearest wall to a plan point (for hosting doors / windows)
function wallHit(p, maxD){
  let best = null;
  for (const w of walls()){
    const r = projSeg(p, w.a, w.b);
    const lim = (maxD !== undefined ? maxD : w.t/2 + 0.6);
    if (r.d < lim && (!best || r.d < best.d)) best = { wall: w, t: r.t, d: r.d, pt: r.pt };
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════
//  ROOM DETECTION — planar face extraction from the wall graph
//  1. split every wall at crossings and T-junctions
//  2. weld coincident endpoints into shared vertices
//  3. walk half-edges, always taking the next edge clockwise,
//     which traces every minimal interior face exactly once
// ══════════════════════════════════════════════════════════════════
const WELD = 0.09;   // ~1 inch

function buildGraph(list){
  const segs = list.map(w => ({ a: w.a.slice(), b: w.b.slice(), src: w }))
                   .filter(s => V.dist(s.a, s.b) > 0.15);

  // 1 · split at pairwise intersections
  const cuts = segs.map(() => []);
  for (let i = 0; i < segs.length; i++){
    for (let j = i+1; j < segs.length; j++){
      const p = segs[i].a, r = V.sub(segs[i].b, segs[i].a);
      const q = segs[j].a, s = V.sub(segs[j].b, segs[j].a);
      const den = r[0]*s[1] - r[1]*s[0];
      if (Math.abs(den) < 1e-9) continue;              // parallel
      const qp = V.sub(q, p);
      const t = (qp[0]*s[1] - qp[1]*s[0]) / den;
      const u = (qp[0]*r[1] - qp[1]*r[0]) / den;
      if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999){
        cuts[i].push(t); cuts[j].push(u);
      }
    }
  }
  // 2 · split at T-junctions (an endpoint sitting on another wall)
  const ends = [];
  segs.forEach(s => { ends.push(s.a, s.b); });
  segs.forEach((s, i) => {
    for (const e of ends){
      const r = projSeg(e, s.a, s.b);
      if (r.d < WELD && r.t > 0.002 && r.t < 0.998) cuts[i].push(r.t);
    }
  });

  // 3 · emit sub-segments
  const sub = [];
  segs.forEach((s, i) => {
    const ts = [0, ...cuts[i], 1].sort((a,b) => a-b);
    for (let k = 0; k < ts.length - 1; k++){
      if (ts[k+1] - ts[k] < 0.002) continue;
      sub.push({ a: V.lerp(s.a, s.b, ts[k]), b: V.lerp(s.a, s.b, ts[k+1]), src: s.src });
    }
  });

  // 4 · weld vertices
  const verts = [];
  const vid = p => {
    for (let i = 0; i < verts.length; i++) if (V.dist(verts[i], p) < WELD) return i;
    verts.push(p.slice()); return verts.length - 1;
  };
  const edges = [], seen = new Set();
  for (const s of sub){
    const i = vid(s.a), j = vid(s.b);
    if (i === j) continue;
    const key = i < j ? i+'_'+j : j+'_'+i;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ i, j, src: s.src });
  }
  return { verts, edges };
}

function detectRooms(f){
  const g = buildGraph(walls(f));
  if (g.edges.length < 3) return [];

  // adjacency, angles measured in a right-handed frame (y = -z)
  const adj = g.verts.map(() => []);
  g.edges.forEach((e, k) => {
    const ang = (from, to) => Math.atan2(-(g.verts[to][1] - g.verts[from][1]), g.verts[to][0] - g.verts[from][0]);
    adj[e.i].push({ to: e.j, a: ang(e.i, e.j), e: k });
    adj[e.j].push({ to: e.i, a: ang(e.j, e.i), e: k });
  });

  const visited = new Set();
  const faces = [];
  const TAU = Math.PI * 2;

  for (const e of g.edges){
    for (const [s0, t0] of [[e.i, e.j], [e.j, e.i]]){
      if (visited.has(s0 + '>' + t0)) continue;
      const loop = [s0];
      let u = s0, v = t0, guard = 0, ok = true;
      while (guard++ < 4000){
        visited.add(u + '>' + v);
        loop.push(v);
        // next edge = the one immediately clockwise from the way we came
        const back = Math.atan2(-(g.verts[u][1] - g.verts[v][1]), g.verts[u][0] - g.verts[v][0]);
        let pick = null, bestD = Infinity;
        for (const n of adj[v]){
          if (n.to === u && adj[v].length > 1) continue;
          let d = (back - n.a + TAU) % TAU;
          if (d < 1e-9) d = TAU;
          if (d < bestD){ bestD = d; pick = n; }
        }
        if (!pick){ ok = false; break; }
        u = v; v = pick.to;
        if (u === s0 && v === t0) break;
        if (visited.has(u + '>' + v)) { ok = false; break; }
      }
      if (!ok || loop.length < 4) continue;
      loop.pop();
      const poly = loop.map(i => g.verts[i]);
      // shoelace in the y = -z frame: interior faces come out positive
      let A = 0;
      for (let i = 0; i < poly.length; i++){
        const p = poly[i], q = poly[(i+1) % poly.length];
        A += p[0] * (-q[1]) - q[0] * (-p[1]);
      }
      A /= 2;
      if (A > 6) faces.push({ poly, area: A });      // ≥ 6 ft², drops slivers + the outer face
    }
  }

  // ── re-attach saved names / finishes to the rooms we just found ──
  // Matching by nearest centroid alone loses the name when a room is split
  // (the old centre can end up far from both halves), and lets two rooms
  // claim the same record. So: containment first, nearest second, and every
  // record can only be claimed once.
  const out = faces.map(fc => {
    let cx = 0, cz = 0;
    fc.poly.forEach(p => { cx += p[0]; cz += p[1]; });
    return { poly: fc.poly, area: fc.area, c: [cx / fc.poly.length, cz / fc.poly.length], meta: null };
  });
  const claimed = new Set();

  for (const m of f.roomMeta){                       // 1 · the room that contains the saved point
    if (claimed.has(m)) continue;
    const hit = out.find(r => !r.meta && pointInPoly(m.c, r.poly));
    if (hit){ hit.meta = m; claimed.add(m); }
  }
  for (const r of out){                              // 2 · otherwise the nearest unclaimed record
    if (r.meta) continue;
    let best = null, bd = 4.5;
    for (const m of f.roomMeta){
      if (claimed.has(m)) continue;
      const d = V.dist(m.c, r.c);
      if (d < bd){ bd = d; best = m; }
    }
    if (best){ r.meta = best; claimed.add(best); }
  }

  for (const r of out){
    r.name = r.meta ? r.meta.name : guessRoomName(r.area);
    r.mat  = r.meta ? r.meta.mat  : null;
  }
  return out;
}

// A sensible default label based on size — the architect renames it in one click.
function guessRoomName(area){
  if (area < 32)  return 'Bath';
  if (area < 55)  return 'Balcony';
  if (area < 85)  return 'Bedroom';
  if (area < 130) return 'Bedroom';
  if (area < 190) return 'Living';
  return 'Living / Dining';
}

function setRoomMeta(room, patch){
  const f = floor();
  let m = room.meta;
  if (!m){ m = { c: room.c.slice(), name: room.name, mat: room.mat }; f.roomMeta.push(m); room.meta = m; }
  Object.assign(m, patch);
  m.c = room.c.slice();
}

// ── Open wall ends ────────────────────────────────────────────────
// A wall end that touches nothing is why a room fails to appear, so we
// find them and mark them in the plan instead of leaving people guessing.
function computeOpenEnds(){
  const ws = walls(), out = [];
  for (const w of ws){
    for (const e of ['a','b']){
      const p = w[e];
      let joined = false;
      for (const o of ws){
        if (o === w) continue;
        if (V.dist(o.a, p) < WELD || V.dist(o.b, p) < WELD){ joined = true; break; }
        const r = projSeg(p, o.a, o.b);                     // lands on another wall (T-junction)
        if (r.d < WELD && r.t > 0.002 && r.t < 0.998){ joined = true; break; }
      }
      if (!joined) out.push(p);
    }
  }
  return out;
}
let openCache = { key: null, pts: [] };
function openEnds(){
  const f = floor();
  const key = f.id + ':' + walls(f).map(w => w.a + '|' + w.b).join(';');
  if (openCache.key !== key) openCache = { key, pts: computeOpenEnds() };
  return openCache.pts;
}

// cached per-rebuild so 2D, 3D and the stats bar agree
let roomCache = { key: null, rooms: [] };
function rooms(){
  const f = floor();
  const key = f.id + ':' + walls(f).map(w => w.a + '|' + w.b + '|' + w.t).join(';') + ':' + f.roomMeta.length;
  if (roomCache.key !== key) roomCache = { key, rooms: detectRooms(f) };
  return roomCache.rooms;
}
function invalidateRooms(){ roomCache.key = null; openCache.key = null; }

function stats(){
  const rs = rooms();
  const area = rs.reduce((s,r) => s + r.area, 0);
  return { area, vol: area * floor().height, count: rs.length };
}

// ══════════════════════════════════════════════════════════════════
//  MATERIALS — procedurally drawn on canvas, so the file stays
//  self-contained (no texture downloads, works offline after boot).
//  `tile` is the real-world size in feet of one texture repeat.
// ══════════════════════════════════════════════════════════════════
const MATS = {
  plaster:  { name:'White Plaster',  sub:'Matte finish',   cat:'wall',  color:'#f4f3f0', rough:.94, metal:0, tex:'plaster', tile:8 },
  paintWarm:{ name:'Warm White',     sub:'Interior paint', cat:'wall',  color:'#efe9df', rough:.92, metal:0, tex:'plaster', tile:8 },
  concrete: { name:'Smooth Concrete',sub:'Light grey',     cat:'wall',  color:'#c9c9c6', rough:.86, metal:0, tex:'concrete',tile:6 },
  brick:    { name:'Exposed Brick',  sub:'Red clay',       cat:'wall',  color:'#a5553c', rough:.95, metal:0, tex:'brick',   tile:4 },
  oak:      { name:'Oak Natural',    sub:'Engineered wood',cat:'floor', color:'#c49a6c', rough:.62, metal:0, tex:'wood',    tile:6 },
  walnut:   { name:'Walnut Dark',    sub:'Hardwood',       cat:'floor', color:'#7d5439', rough:.55, metal:0, tex:'wood',    tile:6 },
  marble:   { name:'Marble White',   sub:'Polished',       cat:'floor', color:'#eceae6', rough:.18, metal:0, tex:'marble',  tile:8 },
  tile:     { name:'Ceramic Tile',   sub:'600×600 grey',   cat:'floor', color:'#d8d6d2', rough:.32, metal:0, tex:'tile',    tile:4 },
  terracotta:{name:'Terracotta',     sub:'BD clay tile',   cat:'floor', color:'#b5764f', rough:.7,  metal:0, tex:'tile',    tile:3 },
  grass:    { name:'Lawn / Turf',    sub:'Outdoor grass',  cat:'floor', color:'#5f8f3e', rough:.97, metal:0, tex:'grass',   tile:5 },
  deck:     { name:'Deck Timber',    sub:'Outdoor wood',   cat:'floor', color:'#9c7a51', rough:.82, metal:0, tex:'wood',    tile:5 },
  mosaic:   { name:'Mosaic Tile',    sub:'Balcony / bath', cat:'floor', color:'#9fb7bd', rough:.35, metal:0, tex:'tile',    tile:2 },
  glass:    { name:'Glass',          sub:'Double glazed',  cat:'other', color:'#cfe3ee', rough:.05, metal:0, tex:null,  tile:1, glass:true },
  metal:    { name:'Matte Black',    sub:'Powder-coated',  cat:'other', color:'#2b2d31', rough:.42, metal:.75,tex:null,  tile:1 },
  steel:    { name:'Brushed Steel',  sub:'Appliance',      cat:'other', color:'#b9bec4', rough:.3,  metal:.9, tex:null,  tile:1 },
  fabric:   { name:'Bouclé Beige',   sub:'Upholstery',     cat:'other', color:'#d9d1c3', rough:.98, metal:0, tex:'fabric', tile:3 },
  fabricD:  { name:'Charcoal Weave', sub:'Upholstery',     cat:'other', color:'#5c6067', rough:.98, metal:0, tex:'fabric', tile:3 },
  wood:     { name:'Oak Furniture',  sub:'Solid timber',   cat:'other', color:'#b5854f', rough:.6,  metal:0, tex:'wood',   tile:3 }
};

function noise(ctx, w, h, amt, alpha){
  const img = ctx.getImageData(0,0,w,h), d = img.data;
  for (let i = 0; i < d.length; i += 4){
    const n = (Math.random() - .5) * amt;
    d[i] += n; d[i+1] += n; d[i+2] += n;
    if (alpha !== undefined) d[i+3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function drawTex(kind, base, S){
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0,0,S,S);

  if (kind === 'plaster'){
    noise(x, S, S, 14);
  }
  else if (kind === 'concrete'){
    noise(x, S, S, 26);
    for (let i = 0; i < 26; i++){
      x.globalAlpha = .05 + Math.random()*.06;
      x.fillStyle = Math.random() > .5 ? '#ffffff' : '#8f8f8c';
      const r = 12 + Math.random()*S*.28;
      x.beginPath(); x.arc(Math.random()*S, Math.random()*S, r, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
  }
  else if (kind === 'wood'){
    const planks = 5, ph = S / planks;
    for (let p = 0; p < planks; p++){
      const shade = 1 + (Math.random() - .5) * .18;
      x.fillStyle = shadeHex(base, shade);
      x.fillRect(0, p*ph, S, ph);
      // grain
      for (let g = 0; g < 26; g++){
        x.strokeStyle = 'rgba(70,45,25,' + (0.03 + Math.random()*0.07) + ')';
        x.lineWidth = .6 + Math.random()*1.4;
        x.beginPath();
        const y0 = p*ph + Math.random()*ph;
        x.moveTo(0, y0);
        for (let sx = 0; sx <= S; sx += S/8) x.lineTo(sx, y0 + Math.sin(sx*.03 + g)*2.2);
        x.stroke();
      }
      // plank seam
      x.strokeStyle = 'rgba(50,32,18,.30)'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(0, p*ph); x.lineTo(S, p*ph); x.stroke();
      // butt joint
      const jx = Math.random()*S;
      x.beginPath(); x.moveTo(jx, p*ph); x.lineTo(jx, (p+1)*ph); x.stroke();
    }
    noise(x, S, S, 8);
  }
  else if (kind === 'marble'){
    noise(x, S, S, 8);
    for (let v = 0; v < 9; v++){
      x.strokeStyle = 'rgba(150,152,158,' + (.10 + Math.random()*.22) + ')';
      x.lineWidth = .8 + Math.random()*3.2;
      x.beginPath();
      let px = Math.random()*S, py = -10;
      x.moveTo(px, py);
      while (py < S + 10){ px += (Math.random()-.5)*S*.22; py += S*.09; x.lineTo(px, py); }
      x.stroke();
    }
  }
  else if (kind === 'tile'){
    const n = 2, t = S/n;
    x.fillStyle = '#9e9c98'; x.fillRect(0,0,S,S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
      x.fillStyle = shadeHex(base, 1 + (Math.random()-.5)*.06);
      x.fillRect(i*t+2, j*t+2, t-4, t-4);
    }
    noise(x, S, S, 8);
  }
  else if (kind === 'brick'){
    const rows = 7, bh = S/rows;
    x.fillStyle = '#cfcabd'; x.fillRect(0,0,S,S);       // mortar
    for (let r = 0; r < rows; r++){
      const off = (r % 2) * (S/6);
      for (let b = -1; b < 4; b++){
        x.fillStyle = shadeHex(base, 1 + (Math.random()-.5)*.22);
        x.fillRect(b*(S/3) + off + 2, r*bh + 2, S/3 - 4, bh - 4);
      }
    }
    noise(x, S, S, 12);
  }
  else if (kind === 'grass'){
    noise(x, S, S, 30);
    for (let i = 0; i < 20; i++){                       // mown patches
      x.globalAlpha = .05 + Math.random()*.09;
      x.fillStyle = Math.random() > .5 ? '#8bb75f' : '#3d6529';
      x.beginPath(); x.arc(Math.random()*S, Math.random()*S, 12 + Math.random()*S*.22, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 1400; i++){                     // blades
      const px = Math.random()*S, py = Math.random()*S, l = 2 + Math.random()*5;
      const light = Math.random() > .5;
      x.strokeStyle = 'rgba(' + (light ? '134,178,92' : '52,88,36') + ',' + (.25 + Math.random()*.45) + ')';
      x.lineWidth = .8;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random()-.5)*2.4, py - l); x.stroke();
    }
  }
  else if (kind === 'fabric'){
    noise(x, S, S, 16);
    x.globalAlpha = .18;
    for (let i = 0; i < S; i += 3){
      x.strokeStyle = i % 6 ? '#ffffff' : '#000000'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(i,0); x.lineTo(i,S); x.stroke();
      x.beginPath(); x.moveTo(0,i); x.lineTo(S,i); x.stroke();
    }
    x.globalAlpha = 1;
  }
  return c;
}

function shadeHex(hex, f){
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round((n>>16 & 255)*f), 0, 255);
  const g = clamp(Math.round((n>>8 & 255)*f), 0, 255);
  const b = clamp(Math.round((n & 255)*f), 0, 255);
  return '#' + ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}

const _mats = {}, _swatch = {};
function getMat(id){
  const d = MATS[id] || MATS.plaster;
  if (_mats[id]) return _mats[id];
  const o = {
    color: new THREE.Color(d.color),
    roughness: d.rough,
    metalness: d.metal,
    envMapIntensity: d.glass ? 1.2 : .62
  };
  if (d.glass){ o.transparent = true; o.opacity = .22; o.side = THREE.DoubleSide; }
  if (d.tex){
    const tex = new THREE.CanvasTexture(drawTex(d.tex, d.color, 256));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    o.map = tex;
    o.color = new THREE.Color(0xffffff);
  }
  const m = new THREE.MeshStandardMaterial(o);
  m.userData.tile = d.tile;
  _mats[id] = m;
  return m;
}
function swatch(id){
  if (_swatch[id]) return _swatch[id];
  const d = MATS[id] || MATS.plaster;
  const c = d.tex ? drawTex(d.tex, d.color, 64) : (() => {
    const cc = document.createElement('canvas'); cc.width = cc.height = 64;
    const g = cc.getContext('2d');
    const grad = g.createLinearGradient(0,0,64,64);
    grad.addColorStop(0, shadeHex(d.color, 1.15)); grad.addColorStop(1, shadeHex(d.color, .82));
    g.fillStyle = grad; g.fillRect(0,0,64,64);
    return cc;
  })();
  return (_swatch[id] = c.toDataURL());
}

// Scale a box geometry's UVs so the texture keeps real-world size.
function scaleUV(geo, mat, w, h, d){
  const tile = (mat.userData && mat.userData.tile) || 4;
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 verts each)
  const spans = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for (let f = 0; f < 6; f++){
    const [su, sv] = spans[f];
    for (let i = 0; i < 4; i++){
      const k = f*4 + i;
      uv.setXY(k, uv.getX(k) * (su/tile), uv.getY(k) * (sv/tile));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// ══════════════════════════════════════════════════════════════════
//  MODEL LIBRARY — every object is generated parametrically from its
//  width / depth / height, so resizing in the panel reshapes the mesh.
//  Local frame: width → X, depth → Z, origin at floor centre.
// ══════════════════════════════════════════════════════════════════
const _solid = {};
function solid(hex, rough, metal){
  const k = hex + '|' + rough + '|' + metal;
  if (!_solid[k]) _solid[k] = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex), roughness: rough === undefined ? .7 : rough, metalness: metal || 0
  });
  return _solid[k];
}
// translucent black, used for panel lines / shadow gaps in furniture
const _shade = {};
function shade(op){
  if (!_shade[op]) _shade[op] = new THREE.MeshStandardMaterial({
    color: 0x000000, transparent: true, opacity: op, roughness: .9, depthWrite: false
  });
  return _shade[op];
}
function box(w, h, d, mat, x, y, z, uv){
  const g = new THREE.BoxGeometry(w, h, d);
  if (uv !== false) scaleUV(g, mat, w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function soft(w, h, d, r, mat, x, y, z){
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w,h,d)/2.05)), mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(rTop, rBot, h, mat, x, y, z, seg){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 20), mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ── Catalogue (sizes in feet, tuned to BD apartment furniture) ─────
const CATALOG = [
  { id:'bed-king',   name:'King Bed',      cat:'Bedroom', w:6.6, d:7.0,  h:2.3 },
  { id:'bed-single', name:'Single Bed',    cat:'Bedroom', w:3.5, d:6.5,  h:2.3 },
  { id:'wardrobe',   name:'Wardrobe',      cat:'Bedroom', w:5.0, d:2.0,  h:7.0 },
  { id:'nightstand', name:'Nightstand',    cat:'Bedroom', w:1.6, d:1.4,  h:2.0 },
  { id:'sofa',       name:'Sofa 3-seat',   cat:'Living',  w:7.0, d:3.0,  h:2.6 },
  { id:'sofa-l',     name:'L-Sectional',   cat:'Living',  w:8.5, d:6.0,  h:2.6 },
  { id:'armchair',   name:'Armchair',      cat:'Living',  w:2.8, d:2.8,  h:2.6 },
  { id:'coffee',     name:'Coffee Table',  cat:'Living',  w:3.6, d:2.0,  h:1.35 },
  { id:'tv-unit',    name:'TV Unit',       cat:'Living',  w:5.0, d:1.4,  h:1.7 },
  { id:'rug',        name:'Area Rug',      cat:'Living',  w:8.0, d:5.5,  h:0.06 },
  { id:'dining',     name:'Dining 6-seat', cat:'Dining',  w:5.5, d:3.0,  h:2.5 },
  { id:'chair',      name:'Chair',         cat:'Dining',  w:1.6, d:1.6,  h:3.0 },
  { id:'island',     name:'Kitchen Island',cat:'Kitchen', w:6.0, d:3.0,  h:3.0 },
  { id:'counter',    name:'Counter Run',   cat:'Kitchen', w:8.0, d:2.0,  h:3.0 },
  { id:'fridge',     name:'Refrigerator',  cat:'Kitchen', w:2.5, d:2.4,  h:6.0 },
  { id:'toilet',     name:'Toilet',        cat:'Bath',    w:1.3, d:2.2,  h:2.5 },
  { id:'basin',      name:'Wash Basin',    cat:'Bath',    w:1.8, d:1.5,  h:2.8 },
  { id:'shower',     name:'Shower',        cat:'Bath',    w:3.0, d:3.0,  h:6.8 },
  { id:'bathtub',    name:'Bathtub',       cat:'Bath',    w:2.5, d:5.2,  h:1.8 },
  { id:'desk',       name:'Study Desk',    cat:'Work',    w:4.0, d:2.0,  h:2.5 },
  { id:'bookshelf',  name:'Bookshelf',     cat:'Work',    w:3.0, d:1.2,  h:6.0 },
  { id:'plant',      name:'Planter',       cat:'Decor',   w:1.8, d:1.8,  h:4.5 },
  { id:'ac',         name:'Split AC',      cat:'Decor',   w:3.0, d:0.8,  h:1.1, mountY:7.2 }
];
const catItem = id => CATALOG.find(c => c.id === id) || CATALOG[0];

function buildFurniture(el){
  const g = new THREE.Group();
  const w = el.w, d = el.d, h = el.h;
  const wood   = getMat(el.mat && MATS[el.mat] ? el.mat : 'wood');
  const cloth  = getMat('fabric');
  const clothD = getMat('fabricD');
  const dark   = solid('#3b3f46', .5, .35);
  const white  = solid('#f3f3f1', .55, 0);
  const chrome = solid('#c8ccd2', .25, .9);

  switch (el.sub){
    case 'bed-king': case 'bed-single': {
      g.add(box(w, .55, d, wood, 0, .38, 0));                                  // frame
      g.add(soft(w-.25, .75, d-.5, .12, white, 0, .95, .12));                  // mattress
      g.add(box(w, h, .3, wood, 0, h/2, -d/2 + .15));                          // headboard
      const pw = Math.min(w*.42, 2.2);
      const pillows = w > 4.5 ? 2 : 1;
      for (let i = 0; i < pillows; i++){
        const px = pillows === 1 ? 0 : (i - .5) * (pw + .35);
        g.add(soft(pw, .3, 1.35, .14, white, px, 1.45, -d/2 + 1.15));
      }
      g.add(soft(w-.3, .12, d*.55, .05, clothD, 0, 1.35, d*.2));               // throw
      break;
    }
    case 'wardrobe': {
      g.add(box(w, h, d, wood, 0, h/2, 0));
      const n = Math.max(2, Math.round(w/2.2)), dw = w/n;
      for (let i = 0; i < n; i++){
        const x = -w/2 + dw*(i + .5);
        g.add(box(dw - .06, h - .12, .04, shade(.09), x, h/2, d/2 + .02, false));
        g.add(cyl(.035, .035, .9, chrome, x + dw*.36, h*.52, d/2 + .06));
      }
      break;
    }
    case 'nightstand':
      g.add(box(w, h - .25, d, wood, 0, (h-.25)/2 + .25, 0));
      g.add(box(w - .1, .05, d - .1, dark, 0, h*.55, 0));
      for (const sx of [-1,1]) for (const sz of [-1,1]) g.add(cyl(.05,.05,.25, dark, sx*(w/2-.15), .12, sz*(d/2-.15), 8));
      break;
    case 'sofa': case 'sofa-l': case 'armchair': {
      const arm = .55, seatH = 1.35, backH = h;
      g.add(soft(w, seatH - .35, d, .12, clothD, 0, (seatH-.35)/2 + .12, 0));          // base
      g.add(soft(w, backH - seatH + .5, .55, .16, clothD, 0, seatH + (backH-seatH+.5)/2 - .25, -d/2 + .3)); // back
      for (const s of [-1, 1]) g.add(soft(arm, backH - seatH + .95, d - .1, .14, clothD, s*(w/2 - arm/2), seatH*.72, .05));
      const seats = Math.max(1, Math.round((w - arm*2) / 2.3));
      for (let i = 0; i < seats; i++){
        const sw = (w - arm*2 - .2) / seats;
        g.add(soft(sw - .1, .32, d - .85, .1, cloth, -w/2 + arm + .1 + sw*(i + .5), seatH + .05, .18));
      }
      if (el.sub === 'sofa-l'){                                                  // chaise return
        const cw = Math.min(3.2, w*.42);
        g.add(soft(cw, seatH - .35, d*.85, .12, clothD, w/2 - cw/2, (seatH-.35)/2 + .12, d/2 + d*.42 - .1));
        g.add(soft(cw - .2, .3, d*.8, .1, cloth, w/2 - cw/2, seatH + .03, d/2 + d*.42 - .1));
      }
      for (const sx of [-1,1]) for (const sz of [-1,1]) g.add(cyl(.06,.05,.4, wood, sx*(w/2-.3), .2, sz*(d/2-.3), 8));
      break;
    }
    case 'coffee':
      g.add(box(w, .14, d, wood, 0, h - .07, 0));
      g.add(box(w - .8, .1, d - .6, wood, 0, h*.4, 0));
      for (const sx of [-1,1]) for (const sz of [-1,1]) g.add(cyl(.07,.06, h - .14, dark, sx*(w/2-.28), (h-.14)/2, sz*(d/2-.24), 10));
      break;
    case 'tv-unit': {
      g.add(box(w, h*.62, d, wood, 0, h*.31 + .18, 0));
      for (const sx of [-1,1]) g.add(cyl(.05,.05,.18, dark, sx*(w/2-.35), .09, 0, 8));
      const tvW = Math.min(w*.92, 5.2);
      g.add(box(tvW, tvW*.56, .07, solid('#15171c', .28, .5), 0, h + tvW*.34, -d*.15));
      g.add(box(tvW - .12, tvW*.56 - .12, .02, solid('#20242e', .12, .6), 0, h + tvW*.34, -d*.15 + .05));
      break;
    }
    case 'rug':
      g.add(box(w, .05, d, getMat('fabric'), 0, .025, 0));
      break;
    case 'dining': {
      const topH = 2.45;
      g.add(box(w, .16, d, wood, 0, topH, 0));
      for (const sx of [-1,1]) for (const sz of [-1,1]) g.add(box(.22, topH - .16, .22, wood, sx*(w/2-.45), (topH-.16)/2, sz*(d/2-.4)));
      const perSide = Math.max(1, Math.round(w / 2.1));
      for (let i = 0; i < perSide; i++){
        const x = -w/2 + (w/perSide)*(i + .5);
        for (const sz of [-1, 1]) g.add(miniChair(x, sz*(d/2 + .9), sz > 0 ? Math.PI : 0, wood, clothD));
      }
      break;
    }
    case 'chair':
      g.add(miniChair(0, 0, 0, wood, clothD));
      break;
    case 'island': {
      g.add(box(w, h - .12, d, white, 0, (h-.12)/2, 0));
      g.add(box(w + .18, .16, d + .18, getMat('marble'), 0, h - .04, 0));       // counter top
      g.add(box(w*.34, .04, d*.42, chrome, -w*.18, h - .1, 0));                 // sink
      g.add(cyl(.05,.05,.9, chrome, -w*.18, h + .4, -d*.16, 10));
      const stools = Math.max(2, Math.round(w/2.4));
      for (let i = 0; i < stools; i++){
        const x = -w/2 + (w/stools)*(i + .5);
        g.add(cyl(.55,.5,.16, dark, x, 2.3, d/2 + .95, 14));
        g.add(cyl(.09,.12,2.2, chrome, x, 1.15, d/2 + .95, 10));
        g.add(cyl(.6,.6,.06, chrome, x, .03, d/2 + .95, 14));
      }
      break;
    }
    case 'counter': {
      g.add(box(w, h - .12, d, white, 0, (h-.12)/2, 0));
      g.add(box(w, .14, d + .06, getMat('marble'), 0, h - .05, .03));
      g.add(box(w, .06, d*.55, solid('#efece6', .5, 0), 0, h + .02, -d*.2, false));
      g.add(box(w*.9, 2.2, d*.62, wood, 0, h + 3.1, -d*.18));                    // upper cabinets
      g.add(box(w*.32, .05, d*.4, chrome, w*.2, h + .06, 0));                    // hob
      break;
    }
    case 'fridge':
      g.add(box(w, h, d, getMat('steel'), 0, h/2, 0));
      g.add(box(w - .1, .04, .04, solid('#8f959c', .3, .8), 0, h*.62, d/2 + .02, false));
      for (const yy of [h*.75, h*.3]) g.add(cyl(.04,.04, h*.28, chrome, w/2 - .28, yy, d/2 + .07, 8));
      break;
    case 'toilet':
      g.add(box(w - .1, 1.5, d*.32, white, 0, .75, -d/2 + d*.16));               // cistern
      g.add(cyl(w*.42, w*.3, 1.05, white, 0, .52, d*.12, 18));
      {
        const seat = new THREE.Mesh(new THREE.TorusGeometry(w*.4, .09, 8, 22), white);
        seat.position.set(0, 1.07, d*.12);
        seat.rotation.x = Math.PI/2;
        seat.castShadow = seat.receiveShadow = true;
        g.add(seat);
      }
      break;
    case 'basin':
      g.add(box(w, .18, d, getMat('marble'), 0, h - .1, 0));
      g.add(box(w - .3, h - .3, d - .2, white, 0, (h-.3)/2, 0));
      g.add(cyl(w*.26, w*.2, .35, white, 0, h + .1, 0, 18));
      g.add(cyl(.05,.05,.75, chrome, 0, h + .35, -d*.3, 10));
      break;
    case 'shower':
      g.add(box(w, .18, d, getMat('tile'), 0, .09, 0));
      for (const [dx, dz, ww, dd] of [[0, -d/2, w, .06], [-w/2, 0, .06, d]])
        g.add(box(ww, h - .2, dd, getMat('glass'), dx, (h-.2)/2 + .18, dz));
      g.add(cyl(.04,.04, 1.2, chrome, w*.3, h - .7, -d/2 + .2, 8));
      g.add(cyl(.32,.32,.06, chrome, w*.3, h - .15, -d/2 + .55, 16));
      break;
    case 'bathtub':
      g.add(soft(w, h, d, .25, white, 0, h/2, 0));
      g.add(soft(w - .45, h - .3, d - .45, .2, solid('#e8f1f5', .18, 0), 0, h/2 + .18, 0));
      g.add(cyl(.05,.05,.6, chrome, 0, h + .3, -d/2 + .3, 10));
      break;
    case 'desk':
      g.add(box(w, .14, d, wood, 0, h - .07, 0));
      for (const sx of [-1,1]) g.add(box(.12, h - .14, d - .2, dark, sx*(w/2-.15), (h-.14)/2, 0));
      g.add(box(w*.42, .04, d*.5, dark, 0, h + .02, -d*.1, false));               // laptop base
      g.add(box(w*.4, w*.24, .03, solid('#22262e', .2, .5), 0, h + w*.14, -d*.3));
      break;
    case 'bookshelf': {
      g.add(box(w, h, d, wood, 0, h/2, 0));
      const shelves = Math.max(3, Math.round(h/1.4));
      for (let s = 1; s < shelves; s++){
        const y = h*s/shelves;
        g.add(box(w - .16, .06, d - .1, shade(.13), 0, y, .03, false));
        let x = -w/2 + .2;
        while (x < w/2 - .4){
          const bw = .1 + Math.random()*.18, bh = .7 + Math.random()*.45;
          g.add(box(bw, bh, d*.6, solid(['#8c5a4a','#4a6076','#7a7f52','#9a8256','#5f5566'][Math.floor(Math.random()*5)], .8, 0), x + bw/2, y + bh/2 + .03, 0, false));
          x += bw + .02;
        }
      }
      break;
    }
    case 'plant': {
      const potH = h*.28;
      g.add(cyl(w*.42, w*.32, potH, solid('#d9d4c9', .8, 0), 0, potH/2, 0, 18));
      g.add(cyl(.06,.08, h - potH, solid('#5b6b3a', .9, 0), 0, potH + (h-potH)/2, 0, 8));
      const leaf = solid('#4f7a3f', .85, 0);
      for (let i = 0; i < 9; i++){
        const a = i * 2.4, r = w*.35 + Math.random()*w*.2, yy = potH + (h - potH)*(.45 + Math.random()*.5);
        const m = new THREE.Mesh(new THREE.SphereGeometry(.42 + Math.random()*.22, 10, 8), leaf);
        m.position.set(Math.cos(a)*r, yy, Math.sin(a)*r);
        m.scale.set(1, .55, 1); m.castShadow = true;
        g.add(m);
      }
      break;
    }
    case 'ac':
      g.add(soft(w, h, d, .1, white, 0, h/2, 0));
      g.add(box(w - .3, .05, .04, solid('#dfe2e6', .7, 0), 0, h*.25, d/2 + .01, false));
      break;
    default:
      g.add(soft(w, h, d, .08, wood, 0, h/2, 0));
  }
  return g;
}

function miniChair(x, z, rot, wood, cloth, parent){
  const c = new THREE.Group();
  c.add(box(1.5, .12, 1.5, wood, 0, 1.45, 0));
  c.add(soft(1.35, .18, 1.35, .06, cloth, 0, 1.6, 0));
  c.add(box(1.4, 1.5, .12, wood, 0, 2.25, -.68));
  for (const sx of [-1,1]) for (const sz of [-1,1]) c.add(cyl(.05,.045,1.45, wood, sx*.62, .72, sz*.62, 8));
  c.position.set(x, 0, z); c.rotation.y = rot;
  if (parent){ parent.add(c); return c; }
  return c;
}

// ── Stairs (parametric: rise is taken from the floor height) ───────
function buildStairs(el){
  const g = new THREE.Group();
  const rise = el.rise || DEF.floorH;
  const n = Math.max(4, Math.round(rise / 0.62));
  const riser = rise / n, tread = el.run ? el.run / n : 0.92;
  const wood = getMat(el.mat && MATS[el.mat] ? el.mat : 'oak');
  const total = tread * n;
  for (let i = 0; i < n; i++){
    const s = box(el.w, riser, tread, wood, 0, riser*(i + .5), -total/2 + tread*(i + .5));
    g.add(s);
    if (i > 0) g.add(box(el.w, riser*i, .06, solid('#e9e7e2', .9, 0), 0, riser*i/2, -total/2 + tread*i - tread/2 + .03, false));
  }
  if (el.rail !== false){
    const rail = solid('#2b2d31', .4, .6);
    for (const s of [-1, 1]){
      if (s < 0 && el.railSide === 'right') continue;
      if (s > 0 && el.railSide === 'left') continue;
      const x = s*(el.w/2 - .08);
      const len = Math.hypot(total, rise);
      const bar = box(.09, .09, len, rail, x, rise/2 + 2.9, 0, false);
      bar.rotation.x = -Math.atan2(rise, total);
      g.add(bar);
      const posts = Math.max(2, Math.round(n/3));
      for (let p = 0; p <= posts; p++){
        const t = p/posts;
        g.add(box(.07, 2.9, .07, rail, x, rise*t + 1.45, -total/2 + total*t, false));
      }
    }
  }
  g.userData.footprint = { w: el.w, d: total };
  return g;
}

function buildColumn(el){
  const g = new THREE.Group();
  const m = getMat(el.mat && MATS[el.mat] ? el.mat : 'concrete');
  if (el.shape === 'round') g.add(cyl(el.w/2, el.w/2, el.h, m, 0, el.h/2, 0, 26));
  else g.add(box(el.w, el.h, el.d, m, 0, el.h/2, 0));
  return g;
}

// ── Doors & windows: frame + leaf / glass, placed inside the hole ──
function buildOpening(op, w){
  const g = new THREE.Group();
  const t = w.t, ow = op.w, oh = op.h;
  const frameM = getMat('metal');
  const woodM  = getMat(op.mat && MATS[op.mat] ? op.mat : 'wood');

  if (op.type === 'door'){
    const fw = .12;
    for (const s of [-1, 1]) g.add(box(fw, oh, t + .04, woodM, s*(ow/2 - fw/2), oh/2, 0));
    g.add(box(ow, fw, t + .04, woodM, 0, oh - fw/2, 0));
    if (op.leaf !== false){
      const lw = ow - fw*2, swing = op.swing === undefined ? 1 : op.swing;
      const pivot = new THREE.Group();
      pivot.position.set(-lw/2 * (op.hinge === 'right' ? -1 : 1), 0, 0);
      const leaf = box(lw, oh - fw, .14, woodM, lw/2 * (op.hinge === 'right' ? -1 : 1), (oh - fw)/2, 0);
      pivot.add(leaf);
      pivot.add(cyl(.05,.05,.28, getMat('steel'),
        (lw - .5) * (op.hinge === 'right' ? -1 : 1), (oh-fw)*.45, .16, 8));
      pivot.rotation.y = (op.hinge === 'right' ? -1 : 1) * swing * (op.open === undefined ? .55 : op.open);
      g.add(pivot);
    }
  } else {
    const fw = .1;
    for (const s of [-1, 1]) g.add(box(fw, oh, t + .02, frameM, s*(ow/2 - fw/2), oh/2, 0));
    for (const s of [-1, 1]) g.add(box(ow, fw, t + .02, frameM, 0, oh/2 + s*(oh/2 - fw/2), 0));
    const panes = Math.max(1, Math.round(ow / 3.2));
    const pw = (ow - fw*2) / panes;
    for (let i = 0; i < panes; i++){
      const x = -ow/2 + fw + pw*(i + .5);
      const glass = box(pw - .05, oh - fw*2, .06, getMat('glass'), x, oh/2, 0, false);
      glass.castShadow = false;
      g.add(glass);
      if (i > 0) g.add(box(.06, oh - fw*2, t*.5, frameM, -ow/2 + fw + pw*i, oh/2, 0, false));
    }
    g.add(box(ow + .18, .1, t + .5, getMat('concrete'), 0, .02, 0));     // sill
  }
  return g;
}

// ══════════════════════════════════════════════════════════════════
//  3D SCENE
// ══════════════════════════════════════════════════════════════════
const cv3 = $('#c3d');
const renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.scene);
scene.fog = new THREE.Fog(PAL.scene, 180, 460);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

const camP = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
camP.position.set(34, 26, 38);
const camO = new THREE.OrthographicCamera(-30, 30, 30, -30, -400, 900);
camO.position.set(0, 120, 0); camO.lookAt(0,0,0);
let cam = camP, camMode = 'orbit';
let controls = new OrbitControls(camP, cv3);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.maxPolarAngle = Math.PI/2 - .02;
controls.target.set(12, 4, 12);

// ── Lighting ──────────────────────────────────────────────────────
const hemi = new THREE.HemisphereLight(0xffffff, PAL.hemiGround, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 1.55);
sun.position.set(48, 70, 34);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdce8ff, .22);
fill.position.set(-40, 30, -30);
scene.add(fill);

// ── Ground + grid ─────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ color: PAL.ground, roughness: .96 })
);
ground.rotation.x = -Math.PI/2;
ground.position.y = -0.6;
ground.receiveShadow = true;
scene.add(ground);

// GridHelper bakes its two colours into the geometry as vertex colours, so a
// theme change means building a new pair rather than recolouring the old one.
// Hence a function and two `let`s where the original had two `const`s.
let gridMinor = null, gridMajor = null;
function buildGrids(){
  for (const g of [gridMinor, gridMajor]){
    if (!g) continue;
    scene.remove(g); g.geometry.dispose(); g.material.dispose();
  }
  gridMinor = new THREE.GridHelper(400, 400, PAL.gridA, PAL.gridB);
  gridMinor.position.y = -0.55; gridMinor.material.transparent = true; gridMinor.material.opacity = .5;
  gridMajor = new THREE.GridHelper(400, 80, PAL.gridC, PAL.gridD);
  gridMajor.position.y = -0.54; gridMajor.material.transparent = true; gridMajor.material.opacity = .75;
  scene.add(gridMinor, gridMajor);
}
buildGrids();

// ── Scene roots ───────────────────────────────────────────────────
const rootBuild = new THREE.Group();   // walls / slabs / objects
const rootGiz   = new THREE.Group();   // selection + preview gizmos
scene.add(rootBuild, rootGiz);

function disposeTree(g){
  g.traverse(o => { if (o.isMesh || o.isSprite){ o.geometry && o.geometry.dispose(); } });
  g.clear();
}

// ── Text sprite labels ────────────────────────────────────────────
function makeLabel(text, opts){
  const o = Object.assign({ bg:PAL.sel, fg:PAL.badgeFg, size:1.5, pad:16, font:600 }, opts || {});
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const F = 52;
  x.font = o.font + ' ' + F + 'px ' + UI_FONT + ', system-ui, sans-serif';
  const lines = String(text).split('\n');
  const wpx = Math.max(...lines.map(l => x.measureText(l).width)) + o.pad*2;
  const hpx = F*1.25*lines.length + o.pad*1.4;
  c.width = Math.ceil(wpx); c.height = Math.ceil(hpx);
  const g = c.getContext('2d');
  g.font = o.font + ' ' + F + 'px ' + UI_FONT + ', system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const r = 14;
  g.fillStyle = o.bg;
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, r); g.fill();
  if (o.border){ g.strokeStyle = o.border; g.lineWidth = 3; g.stroke(); }
  g.fillStyle = o.fg;
  lines.forEach((l, i) => g.fillText(l, c.width/2, hpx/2 + (i - (lines.length-1)/2) * F*1.2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sp.scale.set(o.size * c.width/c.height, o.size, 1);
  sp.renderOrder = 999;
  return sp;
}

// ══════════════════════════════════════════════════════════════════
//  BUILD — project data → meshes
// ══════════════════════════════════════════════════════════════════
function wallHeight(w, f){ return w.h || (f || floorOf(w)).height; }

// A wall becomes several boxes so that doors and windows are real holes.
function buildWall(w, elev, f){
  const g = new THREE.Group();
  const L = wallLen(w), H = wallHeight(w, f), T = w.t;
  if (L < .05) return g;
  const mat = getMat(w.mat || 'plaster');
  const ops = openingsOf(w.id)
    .map(o => ({ o, c: clamp(o.off, o.w/2, Math.max(o.w/2, L - o.w/2)) }))
    .sort((a,b) => a.c - b.c);

  const seg = (x0, x1) => {
    const len = x1 - x0;
    if (len > 0.02) g.add(box(len, H, T, mat, x0 + len/2 - L/2, H/2, 0));
  };
  let cursor = 0;
  for (const { o, c } of ops){
    const s = clamp(c - o.w/2, 0, L), e = clamp(c + o.w/2, 0, L);
    seg(cursor, s);
    const sill = o.type === 'window' ? o.sill : 0;
    if (sill > 0.02) g.add(box(e - s, sill, T, mat, s + (e-s)/2 - L/2, sill/2, 0));       // under sill
    const top = sill + o.h;
    if (H - top > 0.02) g.add(box(e - s, H - top, T, mat, s + (e-s)/2 - L/2, top + (H-top)/2, 0));  // lintel
    const om = buildOpening(o, w);
    om.position.set(c - L/2, sill, 0);
    om.userData.elId = o.id;
    g.add(om);
    cursor = e;
  }
  seg(cursor, L);

  const mid = V.lerp(w.a, w.b, .5);
  g.position.set(mid[0], elev, mid[1]);
  g.rotation.y = -wallAngle(w);
  g.userData.elId = w.id;
  return g;
}

// Floor slab + optional ceiling from a detected room polygon
function buildSlab(room, elev, matId, thick, isCeiling){
  const shape = new THREE.Shape(room.poly.map(p => new THREE.Vector2(p[0], -p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.rotateX(-Math.PI/2);
  const mat = getMat(matId);
  const tile = (mat.userData && mat.userData.tile) || 6;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)/tile, uv.getY(i)/tile);
  uv.needsUpdate = true;
  const m = new THREE.Mesh(geo, mat);
  m.position.y = elev + (isCeiling ? 0 : -thick);
  m.receiveShadow = true;
  m.castShadow = !!isCeiling;
  return m;
}

function buildObject(el, elev){
  let g;
  if (el.type === 'furniture') g = buildFurniture(el);
  else if (el.type === 'stairs') g = buildStairs(el);
  else if (el.type === 'column') g = buildColumn(el);
  else return null;
  g.position.set(el.x, elev + (el.mountY || 0), el.z);
  g.rotation.y = -(el.rot || 0);
  g.userData.elId = el.id;
  return g;
}

let roomLabels = [];
function rebuild3D(){
  disposeTree(rootBuild);
  roomLabels = [];
  const activeIdx = P.active;

  P.floors.forEach((f, fi) => {
    if (!f.visible) return;
    // levels above the one being edited are hidden by default, otherwise their
    // floor slab seals the level you are working on
    if (fi > activeIdx && !showCfg.above) return;
    const elev = f.elevation;
    const isActive = fi === activeIdx;
    const grp = new THREE.Group();
    grp.userData.floorIndex = fi;

    const rs = fi === activeIdx ? rooms() : detectRooms(f);

    for (const r of rs){
      grp.add(buildSlab(r, elev, r.mat || f.floorMat, DEF.slabT, false));
      if (showCfg.ceilings) grp.add(buildSlab(r, elev + f.height, f.ceilMat, .35, true));
      if (isActive && showCfg.dims){
        const lb = makeLabel(r.name + '\n' + U.fmtArea(r.area),
          { bg:PAL.labelBg, fg:PAL.labelFg, size:1.5, border:PAL.labelLine });
        lb.position.set(r.c[0], elev + .12, r.c[1]);
        lb.visible = camMode === 'top';
        grp.add(lb); roomLabels.push(lb);
      }
    }
    for (const w of f.elements) if (w.type === 'wall') grp.add(buildWall(w, elev, f));
    for (const e of f.elements){
      const o = buildObject(e, elev);
      if (o) grp.add(o);
    }
    rootBuild.add(grp);
  });

  fitSun();
  buildGizmos();
}

function bounds(){
  const b = new THREE.Box3().setFromObject(rootBuild);
  if (!isFinite(b.min.x)) b.set(new THREE.Vector3(-10,0,-10), new THREE.Vector3(10,10,10));
  return b;
}
function fitSun(){
  const b = bounds();
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(14, b.getSize(new THREE.Vector3()).length() * .62);
  sun.position.set(c.x + r*.75, c.y + r*1.25, c.z + r*.55);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();
  const s = sun.shadow.camera;
  s.left = -r; s.right = r; s.top = r; s.bottom = -r;
  s.near = 0.5; s.far = r*4.5;
  s.updateProjectionMatrix();
}

// ── Selection gizmos + drag handles ───────────────────────────────
const HANDLE_M = new THREE.MeshBasicMaterial({ color: 0xffffff });
const HANDLE_E = new THREE.MeshBasicMaterial({ color: PAL.sel3d });
const SEL_FILL = new THREE.MeshBasicMaterial({ color: PAL.sel3d, transparent: true, opacity: .42, depthWrite: false });
const SEL_LINE = new THREE.LineBasicMaterial({ color: PAL.sel3d });

function handleMesh(x, y, z, data){
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), HANDLE_E);
  const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), HANDLE_M);
  g.add(a, b);
  g.position.set(x, y, z);
  g.userData.handle = data;
  g.renderOrder = 998;
  a.renderOrder = b.renderOrder = 998;
  a.material.depthTest = b.material.depthTest = false;
  return g;
}

function buildGizmos(){
  disposeTree(rootGiz);
  const el = selEl();
  if (!el) return;
  const f = P.floors.find(f => f.elements.includes(el)) || floor();
  const elev = f.elevation;

  if (el.type === 'wall'){
    const L = wallLen(el), H = wallHeight(el);
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(L, H, el.t + .04), SEL_FILL);
    b.position.y = H/2;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, el.t + .05)), SEL_LINE);
    edge.position.y = H/2;
    g.add(b, edge);
    const mid = V.lerp(el.a, el.b, .5);
    g.position.set(mid[0], elev, mid[1]);
    g.rotation.y = -wallAngle(el);
    rootGiz.add(g);
    rootGiz.add(handleMesh(el.a[0], elev + .3, el.a[1], { kind:'wallEnd', id: el.id, end:'a' }));
    rootGiz.add(handleMesh(el.b[0], elev + .3, el.b[1], { kind:'wallEnd', id: el.id, end:'b' }));
    const lb = makeLabel(U.fmt(L), { size: 1.6 });
    lb.position.set(mid[0], elev + H*.55, mid[1]);
    rootGiz.add(lb);
  }
  else if (el.type === 'door' || el.type === 'window'){
    const w = byId(el.host);
    if (w){
      const L = wallLen(w), c = clamp(el.off, el.w/2, Math.max(el.w/2, L - el.w/2));
      const sill = el.type === 'window' ? el.sill : 0;
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(el.w, el.h, w.t + .12), SEL_FILL);
      b.position.set(c - L/2, sill + el.h/2, 0);
      g.add(b);
      const mid = V.lerp(w.a, w.b, .5);
      g.position.set(mid[0], elev, mid[1]);
      g.rotation.y = -wallAngle(w);
      rootGiz.add(g);
      const p = V.lerp(w.a, w.b, c/L);
      const lb = makeLabel(U.fmt(el.w) + ' × ' + U.fmt(el.h), { size: 1.4 });
      lb.position.set(p[0], elev + sill + el.h + .9, p[1]);
      rootGiz.add(lb);
    }
  }
  else {
    const size = { w: el.w || 2, d: el.d || 2, h: el.h || 2 };
    if (el.type === 'stairs'){ size.d = (el.run || 8); size.h = el.rise || DEF.floorH; }
    const g = new THREE.Group();
    const bx = new THREE.BoxGeometry(size.w, size.h, size.d);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(bx), SEL_LINE);
    line.position.y = size.h/2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(size.w, .05, size.d), SEL_FILL);
    base.position.y = .03;
    g.add(line, base);
    g.position.set(el.x, elev + (el.mountY || 0), el.z);
    g.rotation.y = -(el.rot || 0);
    rootGiz.add(g);
    // rotate handle in front of the object
    const rh = new THREE.Vector3(0, .3, size.d/2 + 1.4).applyAxisAngle(new THREE.Vector3(0,1,0), -(el.rot||0));
    rootGiz.add(handleMesh(el.x + rh.x, elev + (el.mountY||0) + .3, el.z + rh.z, { kind:'rotate', id: el.id }));
    const lb = makeLabel(catName(el) + '  ' + U.fmt(size.w) + '×' + U.fmt(size.d), { size: 1.3 });
    lb.position.set(el.x, elev + (el.mountY||0) + size.h + 1, el.z);
    rootGiz.add(lb);
  }
}
function catName(el){
  if (el.type === 'furniture') return catItem(el.sub).name;
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

// ── Preview (ghost) while drawing ─────────────────────────────────
const ghost = new THREE.Group();
scene.add(ghost);
function setGhost(builder){
  disposeTree(ghost);
  if (builder) builder(ghost);
}

// ── Picking ───────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const planeY = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
function ndc(e){
  const r = cv3.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left)/r.width)*2 - 1, -((e.clientY - r.top)/r.height)*2 + 1);
}
function groundPoint(e){
  ray.setFromCamera(ndc(e), cam);
  planeY.constant = -floor().elevation;
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(planeY, p) ? [p.x, p.z] : null;
}
function pick3D(e){
  ray.setFromCamera(ndc(e), cam);
  const hitsG = ray.intersectObjects(rootGiz.children, true);
  for (const h of hitsG){
    let o = h.object;
    while (o && !o.userData.handle) o = o.parent;
    if (o) return { handle: o.userData.handle, point: h.point };
  }
  const hits = ray.intersectObjects(rootBuild.children, true);
  for (const h of hits){
    let o = h.object;
    while (o && o.userData.elId === undefined) o = o.parent;
    if (o) return { elId: o.userData.elId, point: h.point, normal: h.face ? h.face.normal : null };
  }
  return { point: (() => { const p = new THREE.Vector3(); planeY.constant = -floor().elevation; return ray.ray.intersectPlane(planeY, p) ? p : null; })() };
}

// ── Camera modes ──────────────────────────────────────────────────
// distance at which a sphere of radius r fills the frame, both axes considered
function fitDistance(r){
  const asp = paneAspect();
  const vFov = camP.fov * Math.PI/180;
  const hFov = 2 * Math.atan(Math.tan(vFov/2) * asp);
  return Math.max(r / Math.sin(vFov/2), r / Math.sin(hFov/2)) * 0.95;
}
function setCam(mode){
  if (walking) exitWalk();
  camMode = mode;
  const b = bounds(), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  const r = Math.max(12, s.length() / 2);
  controls.dispose();
  if (mode === 'top'){
    cam = camO;
    const asp = paneAspect();
    const half = Math.max(s.x/asp, s.z) * 0.62 + 4;
    camO.left = -half*asp; camO.right = half*asp; camO.top = half; camO.bottom = -half;
    camO.position.set(c.x, c.y + 220, c.z + .001);
    camO.updateProjectionMatrix();
    controls = new OrbitControls(camO, cv3);
    controls.enableRotate = false;
    controls.target.copy(c);
  } else {
    cam = camP;
    const d = fitDistance(r);
    // ~35° elevation keeps the interior visible over the walls (dollhouse view)
    const dir = mode === 'iso'
      ? new THREE.Vector3(1, 1, 1).normalize()
      : new THREE.Vector3(0.78, 0.88, 1.08).normalize();
    camP.position.copy(c).addScaledVector(dir, d);
    controls = new OrbitControls(camP, cv3);
    controls.maxPolarAngle = Math.PI/2 - .02;
    controls.target.copy(c);
  }
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.update();
  applyControlMode();          // rebuilding controls resets the button map
  roomLabels.forEach(l => l.visible = mode === 'top');
  $$('#ov3d [data-cam]').forEach(b2 => b2.classList.toggle('on', b2.dataset.cam === mode));
  resize3D();
}
function paneAspect(){
  const r = $('#pane3d').getBoundingClientRect();
  return Math.max(.2, r.width / Math.max(1, r.height));
}
function frameScene(){ setCam(camMode); }

// ── Walk mode ─────────────────────────────────────────────────────
let walking = false, plc = null;
const keys = {};
const walkV = new THREE.Vector3();
function enterWalk(){
  if (walking) return;
  walking = true;
  cam = camP;
  const b = bounds(), c = b.getCenter(new THREE.Vector3());
  camP.position.set(c.x, floor().elevation + 5.4, c.z + Math.max(8, b.getSize(new THREE.Vector3()).z*.35));
  camP.lookAt(c.x, floor().elevation + 5.4, c.z);
  controls.enabled = false;
  plc = new PointerLockControls(camP, cv3);
  scene.add(plc.object);
  $('#walkHud').classList.add('on');
  $('#btnWalk').classList.add('on');
  $('#tag3d').textContent = 'WALK MODE';
  const start = () => plc.lock();
  $('#walkHud').onclick = start;
  cv3.addEventListener('click', start);
  plc.addEventListener('lock', () => $('#walkHud').classList.remove('on'));
  plc.addEventListener('unlock', () => { if (walking) $('#walkHud').classList.add('on'); });
  setTimeout(start, 60);
}
function exitWalk(){
  if (!walking) return;
  walking = false;
  try { plc.unlock(); } catch(e){}
  if (plc && plc.object && plc.object.parent) scene.remove(plc.object);
  plc = null;
  $('#walkHud').classList.remove('on');
  $('#btnWalk').classList.remove('on');
  $('#tag3d').textContent = '3D VIEW';
  controls.enabled = true;
  setCam(camMode);
}
on(window, 'keydown', e => { keys[e.code] = true; });
on(window, 'keyup',   e => { keys[e.code] = false; });

// ── Resize + render loop ──────────────────────────────────────────
function resize3D(){
  const r = $('#pane3d').getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  renderer.setSize(r.width, r.height, false);
  camP.aspect = r.width / r.height;
  camP.updateProjectionMatrix();
  const half = (camO.top - camO.bottom)/2 || 30;
  const asp = r.width / r.height;
  camO.left = -half*asp; camO.right = half*asp;
  camO.updateProjectionMatrix();
}

let last = performance.now();
function loop(now){
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last)/1000); last = now;
  if (walking && plc && plc.isLocked){
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 16 : 7) * dt;
    walkV.set(0,0,0);
    if (keys.KeyW || keys.ArrowUp)    walkV.z += 1;
    if (keys.KeyS || keys.ArrowDown)  walkV.z -= 1;
    if (keys.KeyA || keys.ArrowLeft)  walkV.x -= 1;
    if (keys.KeyD || keys.ArrowRight) walkV.x += 1;
    if (walkV.lengthSq() > 0){
      walkV.normalize().multiplyScalar(sp);
      plc.moveForward(walkV.z); plc.moveRight(walkV.x);
    }
    if (keys.KeyQ) camP.position.y -= sp;
    if (keys.KeyE) camP.position.y += sp;
    camP.position.y = Math.max(floor().elevation + 1.5, camP.position.y);
  } else if (controls.enabled){
    controls.update();
  }
  renderer.render(scene, cam);
}
rafId = requestAnimationFrame(loop);

// ══════════════════════════════════════════════════════════════════
//  2D FLOOR PLAN VIEW
// ══════════════════════════════════════════════════════════════════
const cv2 = $('#c2d'), g2 = cv2.getContext('2d');
const cam2 = { s: 15, x: 0, y: 0 };        // s = px per foot
let selRoom = null;                         // {c:[x,z]} — rooms are derived, matched by centroid
let cursor = null, snapMark = null, measure = null;

const w2s = p => [p[0]*cam2.s + cam2.x, p[1]*cam2.s + cam2.y];
const s2w = (px, py) => [(px - cam2.x)/cam2.s, (py - cam2.y)/cam2.s];

function resize2D(){
  const r = $('#pane2d').getBoundingClientRect();
  if (r.width < 2) return;
  const dpr = Math.min(devicePixelRatio, 2);
  cv2.width = r.width*dpr; cv2.height = r.height*dpr;
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  cv2._w = r.width; cv2._h = r.height;
  draw2D();
}

// The tints themselves moved into THEMES — a room has to be a different colour
// on dark paper than on light — so this now just reads whichever set is live.
const tintFor = n => PAL.tints[n] || PAL.tint;

function draw2D(){
  const W = cv2._w, H = cv2._h;
  if (!W) return;
  g2.clearRect(0,0,W,H);
  g2.fillStyle = PAL.paper; g2.fillRect(0,0,W,H);

  if (showCfg.grid) drawGrid2D(W, H);

  const rs = rooms();

  // ── rooms
  g2.lineJoin = 'round';
  for (const r of rs){
    g2.beginPath();
    r.poly.forEach((p, i) => { const s = w2s(p); i ? g2.lineTo(s[0], s[1]) : g2.moveTo(s[0], s[1]); });
    g2.closePath();
    const isSel = selRoom && V.dist(selRoom.c, r.c) < 1.2;
    g2.fillStyle = isSel ? PAL.roomSel : tintFor(r.name);
    g2.fill();
    if (isSel){ g2.strokeStyle = PAL.sel; g2.lineWidth = 2; g2.stroke(); }
  }

  // ── walls
  for (const w of walls()){
    const sel = w.id === sel_(), hov = w.id === hover;
    drawWall2D(w, sel, hov);
  }
  // ── openings drawn on top of their wall
  for (const e of els()) if (e.type === 'door' || e.type === 'window') drawOpening2D(e);
  // ── objects
  for (const e of els()) if (e.type === 'furniture' || e.type === 'stairs' || e.type === 'column') drawObject2D(e);

  // ── room labels (their boxes reserve space so dimensions don't overlap)
  const labelBoxes = [];
  for (const r of rs){
    const c = w2s(r.c);
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillStyle = PAL.roomName;
    g2.font = '600 ' + clamp(cam2.s*0.85, 10, 15) + 'px ' + UI_FONT + ', system-ui, sans-serif';
    const tw = g2.measureText(r.name).width;
    g2.fillText(r.name, c[0], c[1] - 7);
    g2.fillStyle = PAL.faint;
    g2.font = '500 ' + clamp(cam2.s*0.68, 9, 12) + 'px ' + UI_FONT + ', system-ui, sans-serif';
    g2.fillText(U.fmtArea(r.area), c[0], c[1] + 8);
    labelBoxes.push({ x: c[0], y: c[1], w: Math.max(tw, 54) + 10, h: 34 });
  }

  if (showCfg.dims) drawDims2D(labelBoxes);
  if (measure) drawMeasure2D();
  drawGhost2D();

  // ── open wall ends: the reason a room won't form
  for (const p of openEnds()){
    const s = w2s(p);
    g2.strokeStyle = PAL.measure; g2.lineWidth = 2;
    g2.beginPath(); g2.arc(s[0], s[1], 5.5, 0, 7); g2.stroke();
    g2.strokeStyle = PAL.measureSoft; g2.lineWidth = 1;
    g2.beginPath(); g2.arc(s[0], s[1], 9.5, 0, 7); g2.stroke();
  }

  // ── snap marker
  if (snapMark){
    const s = w2s(snapMark.p);
    g2.strokeStyle = snapMark.kind === 'point' ? PAL.measure : PAL.sel;
    g2.lineWidth = 1.6;
    g2.beginPath(); g2.arc(s[0], s[1], 6, 0, 7); g2.stroke();
    g2.beginPath(); g2.moveTo(s[0]-9, s[1]); g2.lineTo(s[0]+9, s[1]);
    g2.moveTo(s[0], s[1]-9); g2.lineTo(s[0], s[1]+9); g2.stroke();
  }
  drawRulers2D(W, H);
}
const sel_ = () => sel;

function drawGrid2D(W, H){
  const g = snapCfg.size, sp = g*cam2.s;
  if (sp > 5){
    g2.strokeStyle = PAL.gridMinor; g2.lineWidth = 1;
    g2.beginPath();
    for (let x = cam2.x % sp; x < W; x += sp){ g2.moveTo(x+.5, 0); g2.lineTo(x+.5, H); }
    for (let y = cam2.y % sp; y < H; y += sp){ g2.moveTo(0, y+.5); g2.lineTo(W, y+.5); }
    g2.stroke();
  }
  const bp = 5*cam2.s;
  g2.strokeStyle = PAL.gridMajor; g2.lineWidth = 1;
  g2.beginPath();
  for (let x = cam2.x % bp; x < W; x += bp){ g2.moveTo(x+.5, 0); g2.lineTo(x+.5, H); }
  for (let y = cam2.y % bp; y < H; y += bp){ g2.moveTo(0, y+.5); g2.lineTo(W, y+.5); }
  g2.stroke();
  // origin
  const o = w2s([0,0]);
  g2.strokeStyle = PAL.axis; g2.lineWidth = 1.4;
  g2.beginPath(); g2.moveTo(o[0], 0); g2.lineTo(o[0], H); g2.moveTo(0, o[1]); g2.lineTo(W, o[1]); g2.stroke();
}

function drawWall2D(w, isSel, isHov){
  const a = w2s(w.a), b = w2s(w.b);
  const t = Math.max(2.5, w.t*cam2.s);
  g2.lineCap = 'butt';
  g2.strokeStyle = isSel ? PAL.sel : (isHov ? PAL.hov : PAL.wall);
  g2.lineWidth = t;
  g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(b[0], b[1]); g2.stroke();
  if (isSel){
    for (const p of [w.a, w.b]){
      const s = w2s(p);
      g2.fillStyle = PAL.paper; g2.strokeStyle = PAL.sel; g2.lineWidth = 2;
      g2.beginPath(); g2.arc(s[0], s[1], 5, 0, 7); g2.fill(); g2.stroke();
    }
    const m = w2s(V.lerp(w.a, w.b, .5));
    badge2D(m[0], m[1], U.fmt(wallLen(w)), PAL.sel);
  }
}

function drawOpening2D(e){
  const w = byId(e.host);
  if (!w) return;
  const L = wallLen(w);
  if (L < .1) return;
  const c = clamp(e.off, e.w/2, Math.max(e.w/2, L - e.w/2));
  const d = wallDir(w), n = V.perp(d);
  const p1 = V.add(w.a, V.mul(d, c - e.w/2));
  const p2 = V.add(w.a, V.mul(d, c + e.w/2));
  const s1 = w2s(p1), s2 = w2s(p2);
  const t = Math.max(2.5, w.t*cam2.s);
  const isSel = e.id === sel;

  // clear the wall under the opening
  g2.strokeStyle = PAL.paper; g2.lineWidth = t + 1; g2.lineCap = 'butt';
  g2.beginPath(); g2.moveTo(s1[0], s1[1]); g2.lineTo(s2[0], s2[1]); g2.stroke();

  g2.strokeStyle = isSel ? PAL.sel : (e.type === 'door' ? PAL.door : PAL.window);
  g2.lineWidth = 1.6;

  if (e.type === 'door'){
    // jambs
    for (const s of [s1, s2]){
      const o1 = [s[0] + n[0]*t/2, s[1] + n[1]*t/2], o2 = [s[0] - n[0]*t/2, s[1] - n[1]*t/2];
      g2.beginPath(); g2.moveTo(o1[0], o1[1]); g2.lineTo(o2[0], o2[1]); g2.stroke();
    }
    // swing arc + leaf
    const hinge = e.hinge === 'right' ? s2 : s1;
    const other = e.hinge === 'right' ? s1 : s2;
    const R = Math.hypot(other[0]-hinge[0], other[1]-hinge[1]);
    const a0 = Math.atan2(other[1]-hinge[1], other[0]-hinge[0]);
    const dir = (e.swing === undefined ? 1 : e.swing) * (e.hinge === 'right' ? -1 : 1);
    g2.beginPath(); g2.arc(hinge[0], hinge[1], R, a0, a0 + dir*Math.PI/2, dir < 0);
    g2.setLineDash([3,3]); g2.stroke(); g2.setLineDash([]);
    const la = a0 + dir*Math.PI/2;
    g2.lineWidth = 2.4;
    g2.beginPath(); g2.moveTo(hinge[0], hinge[1]); g2.lineTo(hinge[0] + Math.cos(la)*R, hinge[1] + Math.sin(la)*R); g2.stroke();
  } else {
    const off = t/2;
    for (const k of [-1, 1]){
      g2.beginPath();
      g2.moveTo(s1[0] + n[0]*off*k, s1[1] + n[1]*off*k);
      g2.lineTo(s2[0] + n[0]*off*k, s2[1] + n[1]*off*k);
      g2.stroke();
    }
    g2.lineWidth = 1.1;
    g2.beginPath(); g2.moveTo(s1[0], s1[1]); g2.lineTo(s2[0], s2[1]); g2.stroke();
  }
  if (isSel){
    const m = w2s(V.lerp(p1, p2, .5));
    badge2D(m[0], m[1] - 14, U.fmt(e.w), PAL.sel);
  }
}

// Where the drag-to-rotate grip sits: in front of the object (local +depth),
// carried around by its own rotation. Shared by the 2D drawing and hit-test.
const ROTATABLE = t => t === 'furniture' || t === 'stairs' || t === 'column';
function rotHandlePos(e){
  const d = (e.type === 'stairs' ? (e.run || 8) : (e.d || 2));
  const gap = d/2 + Math.max(1.1, 24/cam2.s);
  const r = e.rot || 0;
  return [e.x - Math.sin(r)*gap, e.z + Math.cos(r)*gap];
}

function drawObject2D(e){
  const c = w2s([e.x, e.z]);
  const isSel = e.id === sel, isHov = e.id === hover;
  g2.save();
  g2.translate(c[0], c[1]);
  g2.rotate(e.rot || 0);
  const w = (e.w || 2)*cam2.s;
  const d = ((e.type === 'stairs' ? (e.run || 8) : e.d) || 2)*cam2.s;
  g2.strokeStyle = isSel ? PAL.sel : (isHov ? PAL.hov : PAL.furn);
  g2.fillStyle = isSel ? PAL.selFill : PAL.furnFill;
  g2.lineWidth = isSel ? 2 : 1.3;
  icon2D(e, -w/2, -d/2, w, d);
  // small arrow marking which way the object faces
  if (isSel || isHov){
    g2.strokeStyle = isSel ? PAL.sel : PAL.faint;
    g2.lineWidth = 1.6;
    g2.beginPath();
    g2.moveTo(0, d*.18); g2.lineTo(0, d*.42);
    g2.moveTo(-d*.07, d*.33); g2.lineTo(0, d*.42); g2.lineTo(d*.07, d*.33);
    g2.stroke();
  }
  g2.restore();

  if (isSel){
    badge2D(c[0], c[1] - d/2 - 12, catName(e), PAL.sel);
    if (ROTATABLE(e.type)) drawRotHandle2D(e, c);
  }
}

function drawRotHandle2D(e, c){
  const h = w2s(rotHandlePos(e));
  g2.strokeStyle = PAL.sel; g2.lineWidth = 1.4;
  g2.setLineDash([3,3]);
  g2.beginPath(); g2.moveTo(c[0], c[1]); g2.lineTo(h[0], h[1]); g2.stroke();
  g2.setLineDash([]);
  g2.beginPath(); g2.arc(h[0], h[1], 8, 0, 7);
  g2.fillStyle = PAL.paper; g2.fill();
  g2.strokeStyle = PAL.sel; g2.lineWidth = 2; g2.stroke();
  // curved arrow glyph inside the grip
  g2.lineWidth = 1.5;
  g2.beginPath(); g2.arc(h[0], h[1], 4, -0.6, 3.4);
  g2.stroke();
  g2.beginPath();
  g2.moveTo(h[0] + 2.2, h[1] - 4.6); g2.lineTo(h[0] + 3.4, h[1] - 2.6); g2.lineTo(h[0] + 5.4, h[1] - 3.6);
  g2.stroke();
}

function rr(x, y, w, h, r){
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  g2.beginPath();
  g2.moveTo(x+r, y); g2.arcTo(x+w, y, x+w, y+h, r); g2.arcTo(x+w, y+h, x, y+h, r);
  g2.arcTo(x, y+h, x, y, r); g2.arcTo(x, y, x+w, y, r); g2.closePath();
}

function icon2D(e, x, y, w, h){
  const S = cam2.s;
  const line = () => { g2.fill(); g2.stroke(); };
  if (e.type === 'column'){
    if (e.shape === 'round'){ g2.beginPath(); g2.arc(0,0,w/2,0,7); }
    else rr(x, y, w, h, 1);
    g2.fillStyle = PAL.ink2; g2.fill(); g2.stroke();
    return;
  }
  if (e.type === 'stairs'){
    rr(x, y, w, h, 1); line();
    const n = Math.max(3, Math.round((e.rise || DEF.floorH)/0.62));
    g2.beginPath();
    for (let i = 1; i < n; i++){ const yy = y + h*i/n; g2.moveTo(x, yy); g2.lineTo(x + w, yy); }
    g2.stroke();
    g2.beginPath();                                    // up arrow
    g2.moveTo(0, y + h*.85); g2.lineTo(0, y + h*.15);
    g2.moveTo(-w*.13, y + h*.28); g2.lineTo(0, y + h*.15); g2.lineTo(w*.13, y + h*.28);
    g2.lineWidth = 1.6; g2.stroke();
    return;
  }
  switch (e.sub){
    case 'bed-king': case 'bed-single':
      rr(x, y, w, h, 3); line();
      g2.beginPath(); g2.moveTo(x, y + h*.26); g2.lineTo(x + w, y + h*.26); g2.stroke();   // pillow line
      { const n = w > 4.5*S ? 2 : 1, pw = w/(n*1.5), gap = (w - n*pw)/(n+1);
        for (let i = 0; i < n; i++) rr(x + gap + i*(pw+gap), y + h*.04, pw, h*.18, 2), line(); }
      break;
    case 'sofa': case 'sofa-l': case 'armchair':
      rr(x, y, w, h, 3); line();
      rr(x + w*.05, y + h*.05, w*.9, h*.28, 2); line();                                     // back
      { const n = Math.max(1, Math.round(w/(2.3*S)));
        for (let i = 0; i < n; i++) rr(x + w*.08 + i*(w*.84/n), y + h*.38, w*.84/n - 2, h*.5, 2), line(); }
      break;
    case 'dining': {
      rr(x, y, w, h, 2); line();
      const per = Math.max(1, Math.round(w/(2.1*S))), cw = Math.min(w/per*.55, 1.5*S);
      for (let i = 0; i < per; i++){
        const cx = x + (w/per)*(i+.5) - cw/2;
        rr(cx, y - cw*.9, cw, cw*.75, 2); line();
        rr(cx, y + h + cw*.15, cw, cw*.75, 2); line();
      }
      break;
    }
    case 'chair': rr(x, y, w, h, 2); line();
      g2.beginPath(); g2.moveTo(x, y+h*.2); g2.lineTo(x+w, y+h*.2); g2.stroke(); break;
    case 'wardrobe': case 'bookshelf':
      rr(x, y, w, h, 1); line();
      { const n = Math.max(2, Math.round(w/(2.2*S)));
        g2.beginPath();
        for (let i = 1; i < n; i++){ g2.moveTo(x + w*i/n, y); g2.lineTo(x + w*i/n, y + h); }
        g2.moveTo(x, y + h*.75); g2.lineTo(x + w, y + h*.75); g2.stroke(); }
      break;
    case 'tv-unit':
      rr(x, y, w, h, 1); line();
      g2.beginPath(); g2.moveTo(x + w*.15, y + h*.2); g2.lineTo(x + w*.85, y + h*.2); g2.lineWidth = 2.4; g2.stroke();
      break;
    case 'island': case 'counter':
      rr(x, y, w, h, 1.5); line();
      g2.beginPath(); g2.arc(x + w*.28, y + h*.5, Math.min(w,h)*.18, 0, 7); g2.stroke();     // sink
      g2.beginPath();
      for (let i = 0; i < 4; i++) g2.arc(x + w*.68 + (i%2)*w*.11, y + h*.35 + Math.floor(i/2)*h*.3, Math.min(w,h)*.07, 0, 7);
      g2.stroke();
      break;
    case 'fridge': rr(x, y, w, h, 1.5); line();
      g2.beginPath(); g2.moveTo(x, y + h*.62); g2.lineTo(x + w, y + h*.62); g2.stroke(); break;
    case 'toilet':
      rr(x + w*.1, y, w*.8, h*.28, 1); line();
      g2.beginPath(); g2.ellipse(0, y + h*.62, w*.42, h*.32, 0, 0, 7); line();
      break;
    case 'basin':
      rr(x, y, w, h, 2); line();
      g2.beginPath(); g2.ellipse(0, 0, w*.32, h*.3, 0, 0, 7); g2.stroke();
      break;
    case 'shower':
      rr(x, y, w, h, 1); line();
      g2.beginPath(); g2.moveTo(x, y); g2.lineTo(x + w, y + h); g2.moveTo(x + w, y); g2.lineTo(x, y + h); g2.stroke();
      g2.beginPath(); g2.arc(x + w*.78, y + h*.22, Math.min(w,h)*.1, 0, 7); g2.stroke();
      break;
    case 'bathtub':
      rr(x, y, w, h, 3); line();
      rr(x + w*.12, y + h*.1, w*.76, h*.8, 3); g2.stroke();
      break;
    case 'desk':
      rr(x, y, w, h, 1); line();
      rr(x + w*.3, y + h*.15, w*.4, h*.35, 1); g2.stroke();
      break;
    case 'plant':
      g2.beginPath(); g2.arc(0, 0, Math.min(w,h)/2, 0, 7); line();
      g2.beginPath();
      for (let i = 0; i < 6; i++){ const a = i*1.05; g2.moveTo(0,0); g2.lineTo(Math.cos(a)*w*.4, Math.sin(a)*h*.4); }
      g2.stroke();
      break;
    case 'rug':
      g2.setLineDash([5,4]); rr(x, y, w, h, 2); g2.fillStyle = PAL.rug; line(); g2.setLineDash([]);
      break;
    default:
      rr(x, y, w, h, 2); line();
  }
}

function badge2D(x, y, text, color){
  g2.font = '600 11px ' + UI_FONT + ', system-ui, sans-serif';
  const w = g2.measureText(text).width + 14;
  g2.fillStyle = color;
  rr(x - w/2, y - 9, w, 18, 5); g2.fill();
  g2.fillStyle = PAL.badgeFg; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.fillText(text, x, y + .5);
}

// ── Dimension lines ───────────────────────────────────────────────
// Labels are culled when they would collide with a room label or another
// dimension, so a dense plan stays readable instead of turning into soup.
function drawDims2D(occupied){
  const ws = walls();
  if (!ws.length) return;
  const boxes = (occupied || []).slice();
  const hits = b => boxes.some(o => Math.abs(b.x-o.x) < (b.w+o.w)/2 + 3 && Math.abs(b.y-o.y) < (b.h+o.h)/2 + 3);

  // building centroid — dimensions are pushed to the outward side of each wall
  let cx = 0, cz = 0, n0 = 0;
  ws.forEach(w => { cx += w.a[0]+w.b[0]; cz += w.a[1]+w.b[1]; n0 += 2; });
  const ctr = [cx/n0, cz/n0];

  g2.lineWidth = 1;
  g2.font = '600 10.5px ' + UI_FONT + ', system-ui, sans-serif';
  g2.textAlign = 'center'; g2.textBaseline = 'middle';

  for (const w of [...ws].sort((a,b) => wallLen(b) - wallLen(a))){
    const L = wallLen(w);
    if (L*cam2.s < 46) continue;
    const d = wallDir(w);
    let n = V.perp(d);
    const mid = V.lerp(w.a, w.b, .5);
    if (V.dist(V.add(mid, n), ctr) < V.dist(V.sub(mid, n), ctr)) n = V.mul(n, -1);
    const off = w.t/2 + 0.8;
    const a = w2s(V.add(w.a, V.mul(n, off))), b = w2s(V.add(w.b, V.mul(n, off)));
    const m = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    const txt = U.fmt(L);
    const tw = g2.measureText(txt).width + 8;
    const bx = { x: m[0], y: m[1], w: tw, h: 14 };
    if (hits(bx)) continue;
    boxes.push(bx);

    g2.strokeStyle = PAL.sel;
    g2.globalAlpha = .7;
    g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(b[0], b[1]); g2.stroke();
    const tick = 4;
    for (const s of [a, b]){
      g2.beginPath();
      g2.moveTo(s[0] - n[0]*tick - d[0]*tick, s[1] - n[1]*tick - d[1]*tick);
      g2.lineTo(s[0] + n[0]*tick + d[0]*tick, s[1] + n[1]*tick + d[1]*tick);
      g2.stroke();
    }
    g2.globalAlpha = 1;
    g2.fillStyle = PAL.paper;
    g2.fillRect(m[0]-tw/2, m[1]-7, tw, 14);
    g2.fillStyle = PAL.sel;
    g2.fillText(txt, m[0], m[1]);
  }
  g2.globalAlpha = 1;

  // overall extents
  let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9;
  ws.forEach(w => { for (const p of [w.a, w.b]){ x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); z0=Math.min(z0,p[1]); z1=Math.max(z1,p[1]); } });
  const pad = 2.2;
  const top = w2s([x0, z0 - pad]), topR = w2s([x1, z0 - pad]);
  const lft = w2s([x0 - pad, z0]), lftB = w2s([x0 - pad, z1]);
  g2.strokeStyle = PAL.faint; g2.fillStyle = PAL.ink2; g2.lineWidth = 1;
  g2.beginPath();
  g2.moveTo(top[0], top[1]); g2.lineTo(topR[0], topR[1]);
  g2.moveTo(lft[0], lft[1]); g2.lineTo(lftB[0], lftB[1]);
  g2.stroke();
  g2.font = '700 11px ' + UI_FONT + ', system-ui, sans-serif';
  g2.fillText(U.fmt(x1-x0), (top[0]+topR[0])/2, top[1] - 9);
  g2.save();
  g2.translate(lft[0] - 10, (lft[1]+lftB[1])/2); g2.rotate(-Math.PI/2);
  g2.fillText(U.fmt(z1-z0), 0, 0);
  g2.restore();
}

function drawMeasure2D(){
  const a = w2s(measure.a), b = w2s(measure.b);
  g2.strokeStyle = PAL.measure; g2.lineWidth = 1.6;
  g2.setLineDash([6,4]);
  g2.beginPath(); g2.moveTo(a[0], a[1]); g2.lineTo(b[0], b[1]); g2.stroke();
  g2.setLineDash([]);
  for (const s of [a,b]){ g2.beginPath(); g2.arc(s[0], s[1], 4, 0, 7); g2.fillStyle = PAL.measure; g2.fill(); }
  badge2D((a[0]+b[0])/2, (a[1]+b[1])/2 - 14, U.fmt(V.dist(measure.a, measure.b), 2), PAL.measure);
}

function drawGhost2D(){
  if (!draft) return;
  if (draft.kind === 'wall' && draft.pts.length){
    g2.strokeStyle = PAL.sel; g2.lineWidth = Math.max(2.5, DEF.wallT*cam2.s);
    g2.globalAlpha = .5; g2.lineCap = 'butt';
    g2.beginPath();
    const pts = draft.pts.concat(draft.cur ? [draft.cur] : []);
    pts.forEach((p, i) => { const s = w2s(p); i ? g2.lineTo(s[0], s[1]) : g2.moveTo(s[0], s[1]); });
    g2.stroke();
    g2.globalAlpha = 1;
    if (draft.cur && draft.pts.length){
      const last = draft.pts[draft.pts.length-1];
      const m = w2s(V.lerp(last, draft.cur, .5));
      const L = V.dist(last, draft.cur);
      const ang = Math.round(Math.atan2(draft.cur[1]-last[1], draft.cur[0]-last[0]) * 180/Math.PI);
      badge2D(m[0], m[1] - 16, U.fmt(L) + '  ·  ' + ((ang % 360) + 360) % 360 + '°', PAL.sel);
    }
  }
  if (draft.kind === 'rect' && draft.a && draft.cur){
    const a = w2s(draft.a), b = w2s(draft.cur);
    g2.strokeStyle = PAL.sel; g2.lineWidth = 1.8; g2.setLineDash([6,4]);
    g2.strokeRect(Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1]));
    g2.setLineDash([]);
    g2.fillStyle = PAL.ghostFill;
    g2.fillRect(Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1]));
    const w = Math.abs(draft.cur[0]-draft.a[0]), h = Math.abs(draft.cur[1]-draft.a[1]);
    badge2D((a[0]+b[0])/2, (a[1]+b[1])/2, U.fmt(w) + ' × ' + U.fmt(h), PAL.sel);
  }
}

function drawRulers2D(W, H){
  const R = 18;
  g2.fillStyle = PAL.rulerBg;
  g2.fillRect(0, 0, W, R); g2.fillRect(0, 0, R, H);
  g2.strokeStyle = PAL.rulerLine; g2.lineWidth = 1;
  g2.beginPath(); g2.moveTo(0, R+.5); g2.lineTo(W, R+.5); g2.moveTo(R+.5, 0); g2.lineTo(R+.5, H); g2.stroke();
  g2.fillStyle = PAL.faint; g2.font = '500 9px ' + UI_FONT + ', system-ui, sans-serif';
  g2.textAlign = 'center'; g2.textBaseline = 'middle';
  const step = cam2.s < 8 ? 20 : (cam2.s < 18 ? 10 : 5);
  const [wx0] = s2w(R, 0), [, wy0] = s2w(0, R);
  const [wx1] = s2w(W, 0), [, wy1] = s2w(0, H);
  for (let x = Math.ceil(wx0/step)*step; x < wx1; x += step){
    const s = w2s([x, 0])[0];
    g2.fillText(Math.round(U.toDisp(x)), s, R/2);
    g2.strokeStyle = PAL.rulerTick;
    g2.beginPath(); g2.moveTo(s, R-4); g2.lineTo(s, R); g2.stroke();
  }
  for (let y = Math.ceil(wy0/step)*step; y < wy1; y += step){
    const s = w2s([0, y])[1];
    g2.save(); g2.translate(R/2, s); g2.rotate(-Math.PI/2);
    g2.fillText(Math.round(U.toDisp(y)), 0, 0); g2.restore();
  }
}

function fit2D(){
  const ws = walls(), objs = els().filter(e => e.x !== undefined);
  let x0=1e9,z0=1e9,x1=-1e9,z1=-1e9;
  ws.forEach(w => { for (const p of [w.a,w.b]){ x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]); } });
  objs.forEach(o => { x0=Math.min(x0,o.x-3);x1=Math.max(x1,o.x+3);z0=Math.min(z0,o.z-3);z1=Math.max(z1,o.z+3); });
  if (x0 > x1){ x0 = -5; z0 = -5; x1 = 35; z1 = 30; }
  const W = cv2._w || 600, H = cv2._h || 400, pad = 60;
  cam2.s = clamp(Math.min((W-pad*2)/Math.max(4, x1-x0), (H-pad*2)/Math.max(4, z1-z0)), 3, 60);
  cam2.x = W/2 - (x0+x1)/2*cam2.s;
  cam2.y = H/2 - (z0+z1)/2*cam2.s;
  draw2D();
}

// ══════════════════════════════════════════════════════════════════
//  TOOLS & INTERACTION  (identical tool behaviour in 2D and in 3D)
// ══════════════════════════════════════════════════════════════════
let draft = null;          // in-progress geometry
let pendingSub = 'sofa';   // catalogue item armed for placement
let drag = null;           // active drag operation

const TOOLS = [
  { id:'select', key:'V', name:'Select', hint:'Click to select · drag to move · drag empty space or hold <kbd>Space</kbd> to pan · <kbd>Del</kbd> to remove',
    svg:'<path d="M4 3l7 17 2.5-6.5L20 11z"/>' },
  { id:'wall', key:'W', name:'Wall', hint:'Click to start the wall, click again for each corner · <kbd>Esc</kbd> or double-click to finish',
    svg:'<path d="M3 6h18M3 6v12M21 6v12M3 18h18"/><path d="M9 6v12M15 6v12"/>' },
  { id:'room', key:'R', name:'Room', hint:'Drag a rectangle — four walls and a floor slab are created, room detected automatically',
    svg:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h9v10"/>' },
  { id:'door', key:'D', name:'Door', hint:'Hover a wall and click to cut a door into it',
    svg:'<path d="M4 21h16M6 21V4h9v17"/><path d="M15 4l4 2v15"/><circle cx="12" cy="13" r=".9"/>' },
  { id:'window', key:'N', name:'Window', hint:'Hover a wall and click to cut a window into it',
    svg:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M3 12h18"/>' },
  { id:'stairs', key:'S', name:'Stairs', hint:'Click to place a stair run — steps are generated from the floor height',
    svg:'<path d="M3 20h4v-4h4v-4h4V8h4V4"/>' },
  { id:'column', key:'C', name:'Column', hint:'Click to place a structural column',
    svg:'<rect x="8" y="3" width="8" height="18" rx="1"/><path d="M5 3h14M5 21h14"/>' },
  { id:'furniture', key:'F', name:'Furniture', hint:'Pick an item in the Library, then click to place it · <kbd>R</kbd> rotates the selection',
    svg:'<path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 11h20v6H2z"/><path d="M5 17v3M19 17v3"/>' },
  { id:'measure', key:'M', name:'Measure', hint:'Click two points to measure a distance · <kbd>Esc</kbd> to clear',
    svg:'<path d="M3 8v8M21 8v8M3 12h18"/><path d="M7 10v4M12 10v4M17 10v4"/>' }
];

function renderRail(){
  const r = $('#rail');
  r.innerHTML = TOOLS.map(t => `
    <button class="tool${t.id === tool ? ' on' : ''}" data-tool="${t.id}" title="${t.name} (${t.key})">
      <span class="key">${t.key}</span>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${t.svg}</svg>
      <span class="lbl">${t.name}</span>
    </button>`).join('')
    + `<div class="rail-sep"></div><div class="rail-title">View</div>
    <button class="tool" id="railFit" title="Fit model in both views">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>
      <span class="lbl">Fit</span></button>
    <button class="tool" id="railFloor" title="Add a floor above">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>
      <span class="lbl">+ Floor</span></button>`;
  r.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('#railFit').onclick = () => { fit2D(); frameScene(); };
  $('#railFloor').onclick = addFloor;
}

function setTool(t){
  tool = t;
  draft = null; setGhost(null);
  if (t !== 'measure') measure = null;
  $$('#rail [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const d = TOOLS.find(x => x.id === t);
  $('#hint').innerHTML = d ? d.hint : '';
  cv2.style.cursor = t === 'select' ? 'default' : 'crosshair';
  cv3.style.cursor = t === 'select' ? 'default' : 'crosshair';
  if (t === 'furniture'){ switchTab('lib'); }
  applyControlMode();
  draw2D();
}

function applyControlMode(){
  const M = THREE.MOUSE;
  if (!controls) return;
  controls.mouseButtons =
    spaceDown        ? { LEFT: M.PAN,    MIDDLE: M.DOLLY, RIGHT: M.ROTATE } :
    tool === 'select'? { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN }
                     : { LEFT: null,     MIDDLE: M.DOLLY, RIGHT: M.ROTATE };
  controls.enableRotate = camMode !== 'top' && !spaceDown;
  controls.screenSpacePanning = true;
}

// ── Element factories ─────────────────────────────────────────────
function addWall(a, b, t){
  const w = { id: uid(), type:'wall', a: a.slice(), b: b.slice(), t: t || DEF.wallT, h: floor().height, mat:'plaster' };
  els().push(w);
  return w;
}
function addRoomRect(a, b, name){
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  if (x1 - x0 < 1.5 || z1 - z0 < 1.5) return null;
  const c = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  for (let i = 0; i < 4; i++) addWall(c[i], c[(i+1)%4], DEF.wallT);
  const centre = [(x0+x1)/2, (z0+z1)/2];
  floor().roomMeta.push({ c: centre, name: name || guessRoomName((x1-x0)*(z1-z0)), mat: null });
  return centre;
}
function addOpening(type, wall, t){
  const L = wallLen(wall);
  const w = type === 'door' ? DEF.doorW : DEF.winW;
  const off = clamp(Math.round(t*L*4)/4, w/2 + .2, Math.max(w/2 + .2, L - w/2 - .2));
  if (L < w + .5) { toast('Wall is too short for this opening'); return null; }
  const o = {
    id: uid(), type, host: wall.id, off, w,
    h: type === 'door' ? DEF.doorH : DEF.winH,
    sill: type === 'door' ? 0 : DEF.winSill,
    mat: type === 'door' ? 'wood' : 'metal',
    hinge: 'left', swing: 1, open: .55
  };
  els().push(o);
  return o;
}
function addObject(kind, sub, x, z){
  let e;
  if (kind === 'furniture'){
    const c = catItem(sub);
    e = { id: uid(), type:'furniture', sub, x, z, rot: 0, w: c.w, d: c.d, h: c.h, mat: null, mountY: c.mountY || 0 };
  } else if (kind === 'stairs'){
    const rise = nextElevGap();
    e = { id: uid(), type:'stairs', x, z, rot: 0, w: 3.6, rise, run: Math.max(6, Math.round(rise/0.62)*0.92), mat:'oak', rail: true };
  } else {
    e = { id: uid(), type:'column', x, z, rot: 0, w: 1.2, d: 1.2, h: floor().height, shape:'square', mat:'concrete' };
  }
  els().push(e);
  return e;
}
function nextElevGap(){
  const f = floor(), nx = P.floors[P.active + 1];
  return nx ? Math.max(6, nx.elevation - f.elevation) : DEF.floorH;
}

function deleteSel(){
  const el = selEl();
  if (!el){
    if (selRoom){ toast('Rooms are generated from walls — delete the walls instead'); }
    return;
  }
  beginChange();
  const f = P.floors.find(f => f.elements.includes(el));
  f.elements = f.elements.filter(e => e.id !== el.id && e.host !== el.id);   // walls take their openings with them
  sel = null;
  commit();
  toast('Deleted');
}
function duplicateSel(){
  const el = selEl();
  if (!el || el.type === 'wall' || el.type === 'door' || el.type === 'window'){ toast('Select an object to duplicate'); return; }
  beginChange();
  const c = JSON.parse(JSON.stringify(el));
  c.id = uid(); c.x += 2; c.z += 2;
  floorOf(el).elements.push(c); sel = c.id;
  commit();
}

// ── Shared pointer logic ──────────────────────────────────────────
function selectAt(p, is3D, pickInfo){
  // 1 · handles on the current selection
  if (is3D && pickInfo && pickInfo.handle) return { handle: pickInfo.handle };
  if (!is3D){
    const el = selEl();
    if (el && el.type === 'wall'){
      for (const end of ['a','b']){
        if (V.dist(p, el[end]) * cam2.s < 9) return { handle: { kind:'wallEnd', id: el.id, end } };
      }
    }
    if (el && ROTATABLE(el.type) && V.dist(p, rotHandlePos(el)) * cam2.s < 11){
      return { handle: { kind:'rotate', id: el.id } };
    }
  }
  // 2 · the room's own name label — the way to reach a room whose floor is
  //     covered in furniture, since furniture always wins a plain click
  if (!is3D){
    const hw = 38/cam2.s, hh = 18/cam2.s;
    for (const r of rooms())
      if (Math.abs(p[0] - r.c[0]) < hw && Math.abs(p[1] - r.c[1]) < hh) return { room: r };
  }

  // 3 · direct element hit
  if (is3D && pickInfo && pickInfo.elId) return { id: pickInfo.elId };
  if (!is3D){
    const tol = 8/cam2.s;
    for (const e of [...els()].reverse()){
      if (e.type === 'door' || e.type === 'window'){
        const w = byId(e.host); if (!w) continue;
        const L = wallLen(w), c = clamp(e.off, e.w/2, L - e.w/2);
        const pt = V.lerp(w.a, w.b, c/L);
        if (V.dist(p, pt) < Math.max(e.w/2, tol)) return { id: e.id };
      } else if (e.type !== 'wall'){
        const dx = p[0] - e.x, dz = p[1] - e.z, a = -(e.rot || 0);
        const lx = dx*Math.cos(a) - dz*Math.sin(a), lz = dx*Math.sin(a) + dz*Math.cos(a);
        const hw = (e.w || 2)/2, hd = ((e.type === 'stairs' ? e.run : e.d) || 2)/2;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) return { id: e.id };
      }
    }
    for (const w of walls()){
      const r = projSeg(p, w.a, w.b);
      if (r.d < w.t/2 + tol) return { id: w.id };
    }
  }
  // 4 · the room underneath
  for (const r of rooms()) if (pointInPoly(p, r.poly)) return { room: r };
  return {};
}
const roomAt = pt => rooms().find(r => pointInPoly(pt, r.poly));
function pointInPoly(p, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const a = poly[i], b = poly[j];
    if (((a[1] > p[1]) !== (b[1] > p[1])) &&
        (p[0] < (b[0]-a[0]) * (p[1]-a[1]) / (b[1]-a[1]) + a[0])) inside = !inside;
  }
  return inside;
}

function onPointerDown(p, is3D, ev, pickInfo){
  if (!p) return;
  const sp = snapPoint(p, draft && draft.pts && draft.pts.length ? draft.pts[draft.pts.length-1] : null);

  switch (tool){
    case 'select': {
      const h = selectAt(p, is3D, pickInfo);
      if (h.handle){
        beginChange();
        if (h.handle.kind === 'rotate'){
          drag = { kind:'rotate', id: h.handle.id, start: p };
        } else {
          // a corner is shared by every wall that ends there — move them together,
          // otherwise the room loop would be torn open
          const w0 = byId(h.handle.id), p0 = w0[h.handle.end].slice();
          const group = [];
          for (const w of walls())
            for (const e of ['a','b'])
              if (V.dist(w[e], p0) < WELD) group.push({ id: w.id, end: e });
          drag = { kind:'wallEnd', id: h.handle.id, end: h.handle.end, group };
        }
        return;
      }
      if (h.id){
        sel = h.id; selRoom = null;
        const el = byId(h.id);
        // clicking something on another level in 3D makes that level active
        const fi = P.floors.findIndex(f => f.elements.includes(el));
        if (fi >= 0 && fi !== P.active){
          P.active = fi;
          invalidateRooms();
          $('#floorChip').textContent = floor().name;
          if (activeTab === 'layers') renderLayers();
        }
        beginChange();
        if (el.type === 'wall')       drag = { kind:'wall', id: el.id, grab: p, a: el.a.slice(), b: el.b.slice() };
        else if (el.type === 'door' || el.type === 'window') drag = { kind:'opening', id: el.id };
        else                          drag = { kind:'move', id: el.id, dx: el.x - p[0], dz: el.z - p[1] };
      } else if (h.room){
        sel = null; selRoom = { c: h.room.c.slice() };
      } else { sel = null; selRoom = null; }
      buildGizmos(); renderProps(); draw2D();
      return;
    }
    case 'wall':
      if (!draft) draft = { kind:'wall', pts: [sp.p], cur: sp.p };
      else {
        const last = draft.pts[draft.pts.length-1];
        if (V.dist(last, sp.p) > .3){
          draft.pts.push(sp.p);
          if (draft.pts.length >= 2){
            beginChange();
            addWall(draft.pts[draft.pts.length-2], sp.p);
            commit();
            draft.cur = sp.p;
          }
        }
      }
      draw2D();
      return;
    case 'room':
      draft = { kind:'rect', a: sp.p, cur: sp.p };
      return;
    case 'door': case 'window': {
      const w = is3D && pickInfo && pickInfo.elId ? byId(pickInfo.elId) : null;
      const hit = (w && w.type === 'wall') ? { wall: w, t: projSeg(p, w.a, w.b).t } : wallHit(p, 1.4);
      if (!hit){ toast('Click on a wall to place a ' + tool); return; }
      beginChange();
      const o = addOpening(tool, hit.wall, hit.t);
      if (o){ sel = o.id; selRoom = null; commit(); renderProps(); }
      return;
    }
    case 'stairs': case 'column': {
      beginChange();
      const e = addObject(tool, null, sp.p[0], sp.p[1]);
      sel = e.id; selRoom = null; commit(); renderProps();
      return;
    }
    case 'furniture': {
      beginChange();
      const e = addObject('furniture', pendingSub, sp.p[0], sp.p[1]);
      sel = e.id; selRoom = null; commit(); renderProps();
      return;
    }
    case 'measure':
      if (!measure || measure.done) measure = { a: sp.p, b: sp.p, done: false };
      else measure.done = true;
      draw2D();
      return;
  }
}

function onPointerMove(p, is3D, ev){
  if (!p) return;
  cursorReadout(p);
  const anchor = draft && draft.pts && draft.pts.length ? draft.pts[draft.pts.length-1] : (drag && drag.kind === 'wallEnd' ? null : null);
  const sp = snapPoint(p, anchor);
  snapMark = (tool !== 'select') ? sp : null;

  if (drag){
    const el = byId(drag.id);
    if (!el) return;
    if (drag.kind === 'move'){
      const q = snapPoint([p[0] + drag.dx, p[1] + drag.dz], null).p;
      el.x = q[0]; el.z = q[1];
    } else if (drag.kind === 'wallEnd'){
      const skip = new Set(drag.group.map(g => g.id));
      const q = snapPoint(p, el[drag.end === 'a' ? 'b' : 'a'], skip).p;
      for (const g of drag.group){
        const w = byId(g.id);
        if (w) w[g.end] = q.slice();
      }
    } else if (drag.kind === 'wall'){
      const d = V.sub(p, drag.grab);
      const na = snapPoint(V.add(drag.a, d), null, new Set([el.id])).p;
      const shift = V.sub(na, drag.a);
      el.a = na; el.b = V.add(drag.b, shift);
    } else if (drag.kind === 'opening'){
      const w = byId(el.host);
      if (w){
        const r = projSeg(p, w.a, w.b), L = wallLen(w);
        el.off = clamp(Math.round(r.t*L*4)/4, el.w/2 + .1, Math.max(el.w/2 + .1, L - el.w/2 - .1));
      }
    } else if (drag.kind === 'rotate'){
      const a = Math.atan2(p[1] - el.z, p[0] - el.x) - Math.PI/2;
      el.rot = snapCfg.ortho ? Math.round(a/(Math.PI/12))*(Math.PI/12) : a;
    }
    invalidateRooms();
    rebuild3D(); draw2D(); renderProps();
    return;
  }

  if (draft){
    if (draft.kind === 'wall'){ draft.cur = sp.p; }
    if (draft.kind === 'rect'){ draft.cur = sp.p; }
    draw2D();
    if (is3D) previewGhost();
    return;
  }
  if (tool === 'measure' && measure && !measure.done){ measure.b = sp.p; draw2D(); return; }

  // hover feedback
  const h = selectAt(p, is3D, null);
  const nh = h.id || null;
  if (nh !== hover){ hover = nh; draw2D(); }
  if (tool !== 'select') draw2D();
}

function onPointerUp(p, is3D){
  if (drag){ drag = null; commit(); return; }
  if (draft && draft.kind === 'rect' && draft.a && draft.cur){
    beginChange();
    const c = addRoomRect(draft.a, draft.cur);
    draft = null;
    if (c){ selRoom = { c }; sel = null; commit(); renderProps(); }
    else { draw2D(); }
    return;
  }
}

function endDraft(){
  if (draft){ draft = null; setGhost(null); draw2D(); }
}

function previewGhost(){
  setGhost(g => {
    if (!draft || draft.kind !== 'wall' || !draft.pts.length || !draft.cur) return;
    const a = draft.pts[draft.pts.length-1], b = draft.cur;
    const L = V.dist(a, b);
    if (L < .1) return;
    const m = V.lerp(a, b, .5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(L, floor().height, DEF.wallT),
      new THREE.MeshBasicMaterial({ color: PAL.sel3d, transparent: true, opacity: .35 })
    );
    mesh.position.set(m[0], floor().elevation + floor().height/2, m[1]);
    mesh.rotation.y = -Math.atan2(b[1]-a[1], b[0]-a[0]);
    g.add(mesh);
    const lb = makeLabel(U.fmt(L), { size: 1.6 });
    lb.position.set(m[0], floor().elevation + floor().height + 1.2, m[1]);
    g.add(lb);
  });
}

function cursorReadout(p){
  $('#cursorPos').textContent = 'x ' + U.fmt(p[0], 1) + '   y ' + U.fmt(p[1], 1);
}

// ── 2D canvas events ──────────────────────────────────────────────
// Panning has to be reachable without a middle button, so there are three
// ways in: hold space, or just drag from empty space with Select, or the
// classic alt / right-drag.
let pan2 = null, pendPan = null, spaceDown = false;

function startPan(e){
  pan2 = { x: e.clientX - cam2.x, y: e.clientY - cam2.y };
  cv2.style.cursor = 'grabbing';
}
function endPan(){
  pan2 = null;
  cv2.style.cursor = spaceDown ? 'grab' : (tool === 'select' ? 'default' : 'crosshair');
}

cv2.addEventListener('mousedown', e => {
  const r = cv2.getBoundingClientRect();
  const p = s2w(e.clientX - r.left, e.clientY - r.top);
  if (e.button === 1 || e.button === 2 || e.altKey || spaceDown){ startPan(e); return; }
  if (e.button === 0 && tool === 'select'){
    const h = selectAt(p, false, null);
    if (!h.id && !h.handle){
      // nothing grabbable here — a drag pans, a click still selects the room
      pendPan = { x: e.clientX, y: e.clientY, p };
      return;
    }
  }
  onPointerDown(p, false, e, null);
});

on(window, 'mousemove', e => {
  if (pan2){ cam2.x = e.clientX - pan2.x; cam2.y = e.clientY - pan2.y; draw2D(); return; }
  if (pendPan){
    if (Math.abs(e.clientX - pendPan.x) + Math.abs(e.clientY - pendPan.y) > 3){
      startPan(e); pendPan = null;
    }
    return;
  }
  if (e.target !== cv2) return;
  const r = cv2.getBoundingClientRect();
  onPointerMove(s2w(e.clientX - r.left, e.clientY - r.top), false, e);
});

on(window, 'mouseup', e => {
  if (pan2){ endPan(); return; }
  if (pendPan){                       // released without moving → normal click
    onPointerDown(pendPan.p, false, e, null);
    onPointerUp(pendPan.p, false);
    pendPan = null;
    return;
  }
  const r = cv2.getBoundingClientRect();
  onPointerUp(s2w(e.clientX - r.left, e.clientY - r.top), false);
});

// Space = temporary pan mode, in both views
on(window, 'keydown', e => {
  if (e.code !== 'Space' || spaceDown) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  e.preventDefault();
  spaceDown = true;
  cv2.style.cursor = 'grab'; cv3.style.cursor = 'grab';
  applyControlMode();
});
on(window, 'keyup', e => {
  if (e.code !== 'Space') return;
  spaceDown = false;
  cv2.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  cv3.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  applyControlMode();
});
on(window, 'blur', () => { spaceDown = false; endPan(); pendPan = null; });
cv2.addEventListener('dblclick', () => endDraft());
cv2.addEventListener('contextmenu', e => e.preventDefault());
cv2.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv2.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  // trackpad sideways swipe, or shift+wheel, scrolls the plan instead of zooming
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)){ cam2.x -= e.deltaX; draw2D(); return; }
  if (e.shiftKey){ cam2.x -= e.deltaY; draw2D(); return; }
  const f = e.deltaY < 0 ? 1.12 : 1/1.12;
  const ns = clamp(cam2.s * f, 2, 90);
  const k = ns / cam2.s;
  cam2.x = px - (px - cam2.x)*k;
  cam2.y = py - (py - cam2.y)*k;
  cam2.s = ns;
  draw2D();
}, { passive: false });

// ── 3D canvas events ──────────────────────────────────────────────
let down3 = null;
cv3.addEventListener('pointerdown', e => {
  if (walking || e.button !== 0) return;
  down3 = { x: e.clientX, y: e.clientY, moved: false };
  if (tool === 'select'){
    const info = pick3D(e);
    if (info.handle){ onPointerDown(groundPoint(e), true, e, info); controls.enabled = false; }
    else down3.info = info;
  } else {
    onPointerDown(groundPoint(e), true, e, pick3D(e));
  }
});
cv3.addEventListener('pointermove', e => {
  if (walking) return;
  const p = groundPoint(e);
  if (down3 && (Math.abs(e.clientX - down3.x) + Math.abs(e.clientY - down3.y) > 3)) down3.moved = true;
  if (drag){ controls.enabled = false; onPointerMove(p, true, e); return; }
  if (down3 && down3.info && down3.info.elId && down3.moved && !drag){
    // start dragging the object we pressed on
    const el = byId(down3.info.elId);
    if (el && el.x !== undefined){
      sel = el.id; selRoom = null; beginChange();
      drag = { kind:'move', id: el.id, dx: el.x - p[0], dz: el.z - p[1] };
      controls.enabled = false;
      buildGizmos(); renderProps();
    }
    return;
  }
  if (tool !== 'select' || draft) onPointerMove(p, true, e);
  else if (p) cursorReadout(p);
});
on(window, 'pointerup', e => {
  if (!down3) return;
  const p = groundPoint(e);
  if (drag){ onPointerUp(p, true); controls.enabled = true; down3 = null; return; }
  if (!down3.moved && tool === 'select' && down3.info){
    onPointerDown(p, true, e, down3.info);
  }
  onPointerUp(p, true);
  controls.enabled = true;
  down3 = null;
});
cv3.addEventListener('dblclick', () => endDraft());
cv3.addEventListener('contextmenu', e => e.preventDefault());

// ── Keyboard ──────────────────────────────────────────────────────
on(window, 'keydown', e => {
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
  if (typing) return;
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (meta && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if (meta && e.key.toLowerCase() === 's'){ e.preventDefault(); saveVersion(); return; }
  if (meta && e.key.toLowerCase() === 'd'){ e.preventDefault(); duplicateSel(); return; }
  if (e.key === 'Escape'){
    if (walking) exitWalk();
    else if (draft) endDraft();
    else { sel = null; selRoom = null; measure = null; buildGizmos(); renderProps(); draw2D(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSel(); return; }
  if (e.key === '1'){ setView('2d'); return; }
  if (e.key === '2'){ setView('split'); return; }
  if (e.key === '3'){ setView('3d'); return; }
  const t = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
  if (t){
    // R doubles as "rotate selection" when an object is selected
    if (t.id === 'room' && selEl() && selEl().x !== undefined){
      beginChange();
      const el = selEl();
      el.rot = ((el.rot || 0) + Math.PI/12) % (Math.PI*2);
      commit();
      return;
    }
    setTool(t.id);
  }
});

// ── View modes ────────────────────────────────────────────────────
function setView(m){
  viewMode = m;
  $('#pane2d').classList.toggle('hidden', m === '3d');
  $('#pane3d').classList.toggle('hidden', m === '2d');
  $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === m));
  requestAnimationFrame(() => { resize2D(); resize3D(); if (m !== '2d') frameScene(); if (m !== '3d') fit2D(); });
}

// ══════════════════════════════════════════════════════════════════
//  PANELS — properties, library, layers, AI
// ══════════════════════════════════════════════════════════════════
let activeTab = 'props';
function switchTab(t){
  activeTab = t;
  ['props','lib','layers','ai'].forEach(n => $('#tab-' + n).style.display = n === t ? 'block' : 'none');
  $$('.ptab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#aiInRow').style.display = t === 'ai' ? 'flex' : 'none';
  if (t === 'lib') renderLib();
  if (t === 'layers') renderLayers();
  if (t === 'ai') renderAI();
  if (t === 'props') renderProps(true);
}
$$('.ptab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

// ── field builders ────────────────────────────────────────────────
let fieldReg = [], propsKey = '';
function fNum(label, icon, get, apply, o){
  o = o || {};
  const id = 'fd' + fieldReg.length;
  fieldReg.push({ id, get, apply, raw: o.raw });
  const val = o.raw ? get() : U.toDisp(get());
  return `<div class="field">
    <span class="fico">${icon || ''}</span><label>${label}</label>
    <div class="inp-wrap"><input class="inp" type="number" id="${id}" step="${o.step || (o.raw ? 1 : (U.unit === 'm' ? .05 : .25))}"
      value="${(+val).toFixed(o.dp !== undefined ? o.dp : (o.raw ? 0 : 2)).replace(/\.?0+$/,'')}">
      <span class="unit">${o.unit !== undefined ? o.unit : U.unit}</span></div></div>`;
}
function fSel(label, icon, options, get, apply){
  const id = 'fd' + fieldReg.length;
  fieldReg.push({ id, get, apply, sel: true });
  const v = get();
  return `<div class="field"><span class="fico">${icon || ''}</span><label>${label}</label>
    <select class="inp" id="${id}">${options.map(o =>
      `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
}
function fText(label, get, apply){
  const id = 'fd' + fieldReg.length;
  fieldReg.push({ id, get, apply, text: true });
  return `<div class="field"><label style="flex:0 0 auto">${label}</label>
    <input class="inp" style="flex:1;width:auto" id="${id}" value="${get()}"></div>`;
}
function fToggle(label, get, apply){
  const id = 'fd' + fieldReg.length;
  fieldReg.push({ id, get, apply, toggle: true });
  return `<div class="field"><label>${label}</label><div class="toggle${get() ? ' on' : ''}" id="${id}"></div></div>`;
}
function fRead(label, value){
  return `<div class="field"><label>${label}</label><span style="font-size:12.5px;font-weight:600">${value}</span></div>`;
}
function mountFields(){
  for (const f of fieldReg){
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.toggle){
      el.onclick = () => { beginChange(); f.apply(!f.get()); commit(); renderProps(true); };
    } else if (f.sel){
      el.onchange = () => { beginChange(); f.apply(el.value); commit(); renderProps(true); };
    } else if (f.text){
      el.oninput = () => f.apply(el.value);
      el.onchange = () => { beginChange(); f.apply(el.value); commit(); };
    } else {
      el.oninput = () => {
        const v = parseFloat(el.value);
        if (isNaN(v)) return;
        beginChange();
        f.apply(f.raw ? v : U.fromDisp(v));
        invalidateRooms(); rebuild3D(); draw2D(); updateStats();
      };
      el.onchange = () => { commit(); };
    }
  }
}
function matGrid(cat, get, apply){
  const ids = cat ? Object.keys(MATS).filter(id => MATS[id].cat === cat) : Object.keys(MATS);
  const cur = get();
  return `<div class="grid3">${ids.map(id => `
    <button class="tile${id === cur ? ' on' : ''}" data-mat="${id}" title="${MATS[id].name}">
      <span class="tsw" style="background-image:url(${swatch(id)})"></span>
      <span class="tnm">${MATS[id].name}</span></button>`).join('')}</div>`;
}
function mountMatGrid(root, apply){
  root.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => {
    beginChange(); apply(b.dataset.mat); commit(); renderProps(true);
  });
}

const ICO = {
  len:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>',
  hgt:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3"/></svg>',
  thk:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5v14M20 5v14M8 12h8"/></svg>',
  rot:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  pos:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke-linecap="round"/></svg>'
};

// ── PROPERTIES ────────────────────────────────────────────────────
function renderProps(force){
  if (activeTab !== 'props') return;
  const el = selEl();
  const key = (el ? el.id + el.type : (selRoom ? 'room' + selRoom.c : 'none'));
  if (!force && drag && key === propsKey){        // live-update values during a drag
    for (const f of fieldReg){
      const n = document.getElementById(f.id);
      if (n && n.tagName === 'INPUT' && document.activeElement !== n && !f.text)
        n.value = (+(f.raw ? f.get() : U.toDisp(f.get()))).toFixed(2).replace(/\.?0+$/,'');
    }
    return;
  }
  propsKey = key;
  fieldReg = [];
  const b = $('#tab-props');
  let h = '';

  if (el && el.type === 'wall'){
    const L = wallLen(el);
    h += phead('Wall', U.fmt(L) + ' long · ' + openingsOf(el.id).length + ' opening(s)',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h18v12H3z"/><path d="M9 6v12M15 6v12"/></svg>');
    h += `<div class="sec"><div class="sec-t">Dimensions</div>`;
    h += fNum('Length', ICO.len, () => wallLen(el), v => {
      const d = wallDir(el);
      el.b = [el.a[0] + d[0]*Math.max(.5, v), el.a[1] + d[1]*Math.max(.5, v)];
    });
    h += fNum('Height', ICO.hgt, () => wallHeight(el), v => el.h = clamp(v, 4, 30));
    h += fNum('Thickness', ICO.thk, () => el.t, v => el.t = clamp(v, .1, 3));
    h += `</div>`;
    h += `<div class="sec"><div class="sec-t">Material</div>${matCard(el.mat || 'plaster')}${matGrid('wall', () => el.mat || 'plaster')}</div>`;
    h += `<div class="sec"><div class="sec-t">Presets</div>
      <div class="grid3">
        <button class="btn sm" data-preset="int">Interior 5&Prime;</button>
        <button class="btn sm" data-preset="ext">Exterior 10&Prime;</button>
        <button class="btn sm" data-preset="para" title="Waist-high balcony parapet">Parapet 3&prime;6&Prime;</button>
      </div></div>`;
    h += `<div class="note"><span class="i">i</span><div>Blue highlight marks the selected wall. Drag the round endpoint handles in either view to reshape it — rooms re-detect instantly.</div></div>`;
    h += delBtn();
  }
  else if (el && (el.type === 'door' || el.type === 'window')){
    const w = byId(el.host), L = w ? wallLen(w) : 0;
    h += phead(el.type === 'door' ? 'Door' : 'Window', U.fmt(el.w) + ' × ' + U.fmt(el.h),
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18"/></svg>');
    h += `<div class="sec"><div class="sec-t">Dimensions</div>`;
    h += fNum('Width', ICO.len, () => el.w, v => el.w = clamp(v, 1, Math.max(1, L - .4)));
    h += fNum('Height', ICO.hgt, () => el.h, v => el.h = clamp(v, 2, floor().height - .3));
    if (el.type === 'window') h += fNum('Sill height', ICO.pos, () => el.sill, v => el.sill = clamp(v, 0, floor().height - el.h - .2));
    h += fNum('Position on wall', ICO.pos, () => el.off, v => el.off = clamp(v, el.w/2, Math.max(el.w/2, L - el.w/2)));
    h += `</div>`;
    if (el.type === 'door'){
      h += `<div class="sec"><div class="sec-t">Swing</div>`;
      h += fSel('Hinge side', ICO.rot, [['left','Left'],['right','Right']], () => el.hinge || 'left', v => el.hinge = v);
      h += fSel('Opens', ICO.rot, [['1','Inward'],['-1','Outward']], () => String(el.swing || 1), v => el.swing = +v);
      h += fNum('Open angle', ICO.rot, () => (el.open || 0)*180/Math.PI, v => el.open = clamp(v,0,110)*Math.PI/180, { raw:true, unit:'°', step:5, dp:0 });
      h += `</div>`;
    }
    h += `<div class="sec"><div class="sec-t">Material</div>${matGrid(null, () => el.mat || 'wood')}</div>`;
    h += delBtn();
  }
  else if (el && el.type === 'furniture'){
    const c = catItem(el.sub);
    h += phead(c.name, c.cat + ' · ' + U.fmt(el.w) + ' × ' + U.fmt(el.d),
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M2 11h20v6H2z"/></svg>');
    h += roomJump(el);
    h += `<div class="sec"><div class="sec-t">Dimensions</div>`;
    h += fNum('Width', ICO.len, () => el.w, v => el.w = clamp(v, .3, 40));
    h += fNum('Depth', ICO.len, () => el.d, v => el.d = clamp(v, .3, 40));
    h += fNum('Height', ICO.hgt, () => el.h, v => el.h = clamp(v, .1, 20));
    h += `</div><div class="sec"><div class="sec-t">Placement</div>`;
    h += fNum('Rotation', ICO.rot, () => (el.rot || 0)*180/Math.PI, v => el.rot = v*Math.PI/180, { raw:true, unit:'°', step:15, dp:0 });
    h += fNum('X', ICO.pos, () => el.x, v => el.x = v);
    h += fNum('Y', ICO.pos, () => el.z, v => el.z = v);
    if (c.mountY !== undefined || el.mountY) h += fNum('Mount height', ICO.hgt, () => el.mountY || 0, v => el.mountY = clamp(v, 0, 20));
    h += `</div>`;
    h += `<div class="sec"><div class="sec-t">Material</div>${matGrid(null, () => el.mat || 'wood')}</div>`;
    h += `<div class="grid2"><button class="btn sm" id="dupBtn">Duplicate</button><button class="btn sm" id="resetSize">Reset size</button></div>`;
    h += delBtn();
  }
  else if (el && el.type === 'stairs'){
    const n = Math.max(4, Math.round((el.rise || DEF.floorH)/0.62));
    h += phead('Stairs', n + ' risers · ' + U.fmt((el.rise||DEF.floorH)/n) + ' rise',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 20h4v-4h4v-4h4V8h4V4"/></svg>');
    h += roomJump(el);
    h += `<div class="sec"><div class="sec-t">Geometry</div>`;
    h += fNum('Width', ICO.len, () => el.w, v => el.w = clamp(v, 2, 12));
    h += fNum('Total rise', ICO.hgt, () => el.rise, v => el.rise = clamp(v, 3, 25));
    h += fNum('Total run', ICO.len, () => el.run, v => el.run = clamp(v, 3, 40));
    h += fRead('Steps', n + ' × ' + U.fmt(el.run/n) + ' tread');
    h += fNum('Rotation', ICO.rot, () => (el.rot||0)*180/Math.PI, v => el.rot = v*Math.PI/180, { raw:true, unit:'°', step:15, dp:0 });
    h += fToggle('Railing', () => el.rail !== false, v => el.rail = v);
    h += `</div><div class="sec"><div class="sec-t">Material</div>${matGrid('floor', () => el.mat || 'oak')}</div>`;
    h += delBtn();
  }
  else if (el && el.type === 'column'){
    h += phead('Column', U.fmt(el.w) + ' × ' + U.fmt(el.d),
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="3" width="8" height="18"/></svg>');
    h += roomJump(el);
    h += `<div class="sec"><div class="sec-t">Dimensions</div>`;
    h += fSel('Shape', ICO.thk, [['square','Square'],['round','Round']], () => el.shape || 'square', v => el.shape = v);
    h += fNum('Width', ICO.len, () => el.w, v => el.w = clamp(v, .3, 8));
    h += fNum('Depth', ICO.len, () => el.d, v => el.d = clamp(v, .3, 8));
    h += fNum('Height', ICO.hgt, () => el.h, v => el.h = clamp(v, 2, 30));
    h += `</div><div class="sec"><div class="sec-t">Material</div>${matGrid('wall', () => el.mat || 'concrete')}</div>`;
    h += delBtn();
  }
  else if (selRoom){
    const r = rooms().find(r => V.dist(r.c, selRoom.c) < 1.5);
    if (!r){ selRoom = null; return renderProps(true); }
    h += phead(r.name, U.fmtArea(r.area) + ' · ' + U.fmtVol(r.area*floor().height),
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h9v10"/></svg>');
    h += `<div class="sec"><div class="sec-t">Room</div>`;
    h += fText('Name', () => r.name, v => { setRoomMeta(r, { name: v }); invalidateRooms(); draw2D(); rebuild3D(); });
    h += fRead('Floor area', U.fmtArea(r.area));
    h += fRead('Perimeter', U.fmt(r.poly.reduce((s,p,i) => s + V.dist(p, r.poly[(i+1)%r.poly.length]), 0)));
    h += fRead('Volume', U.fmtVol(r.area*floor().height));
    h += `</div>`;
    h += `<div class="sec"><div class="sec-t">Floor finish</div>${matGrid('floor', () => r.mat || floor().floorMat)}</div>`;
    h += `<div class="note"><span class="i">i</span><div>This room was detected automatically from the closed wall loop. Move a wall and the area updates live.</div></div>`;
  }
  else {
    const f = floor(), st = stats();
    h += phead(f.name, U.fmtArea(st.area) + ' · ' + st.count + ' rooms',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>');
    h += `<div class="sec"><div class="sec-t">Level</div>`;
    h += fText('Name', () => f.name, v => { f.name = v; $('#floorChip').textContent = v; });
    h += fNum('Ceiling height', ICO.hgt, () => f.height, v => { f.height = clamp(v, 6, 25); });
    h += fNum('Elevation', ICO.pos, () => f.elevation, v => f.elevation = v);
    h += `</div>`;
    h += `<div class="sec"><div class="sec-t">Default finishes</div>
      <div style="font-size:10.5px;color:var(--muted);margin-bottom:6px">Floor</div>${matGrid('floor', () => f.floorMat)}</div>`;
    h += `<div class="sec"><div class="sec-t">Schedule</div>
      ${fRead('Walls', walls(f).length)}
      ${fRead('Doors', els().filter(e => e.type==='door').length)}
      ${fRead('Windows', els().filter(e => e.type==='window').length)}
      ${fRead('Furniture', els().filter(e => e.type==='furniture').length)}
      ${fRead('Built area', U.fmtArea(st.area))}
      ${fRead('Volume', U.fmtVol(st.vol))}</div>`;
    h += `<div class="empty" style="padding:12px 0">
      <div class="et">Nothing selected</div>
      <div class="es">Pick a tool on the left, or click any wall, room or object to edit it.</div></div>`;
  }
  b.innerHTML = h;
  mountFields();
  mountMatGrid(b, id => {
    if (el){ el.mat = id; }
    else if (selRoom){ const r = rooms().find(r => V.dist(r.c, selRoom.c) < 1.5); if (r) setRoomMeta(r, { mat: id }); }
    else { floor().floorMat = id; }
  });
  const jump = b.querySelector('#pickRoom');
  if (jump) jump.onclick = () => {
    const r = roomAt([el.x, el.z]);
    if (!r) return;
    sel = null; selRoom = { c: r.c.slice() };
    buildGizmos(); renderProps(true); draw2D();
  };
  const del = b.querySelector('#delBtn'); if (del) del.onclick = deleteSel;
  const dup = b.querySelector('#dupBtn'); if (dup) dup.onclick = duplicateSel;
  const rs  = b.querySelector('#resetSize');
  if (rs) rs.onclick = () => { beginChange(); const c = catItem(el.sub); el.w = c.w; el.d = c.d; el.h = c.h; commit(); renderProps(true); };
  const WALL_PRESETS = {
    int:  { t: DEF.wallT,    mat:'plaster'  },
    ext:  { t: DEF.extWallT, mat:'concrete' },
    para: { t: 0.5,          mat:'concrete', h: 3.5 }   // balcony / terrace parapet
  };
  b.querySelectorAll('[data-preset]').forEach(btn => btn.onclick = () => {
    const cfg = WALL_PRESETS[btn.dataset.preset];
    if (!cfg) return;
    beginChange();
    el.t = cfg.t; el.mat = cfg.mat;
    el.h = cfg.h !== undefined ? cfg.h : floorOf(el).height;
    commit(); renderProps(true);
  });
}
// Furniture sits on top of the floor and swallows the click, so give every
// object a way back to the room it stands in.
function roomJump(el){
  const r = roomAt([el.x, el.z]);
  if (!r) return '';
  return `<button class="btn sm" id="pickRoom" style="width:100%;justify-content:center;margin-bottom:12px">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h9v10"/></svg>
    Edit floor of ${r.name}</button>`;
}
function phead(t, s, ico){
  return `<div class="phead"><div class="ico">${ico}</div><div><div class="tt">${t}</div><div class="st">${s}</div></div></div>`;
}
function matCard(id){
  const m = MATS[id] || MATS.plaster;
  return `<div class="mat-card" style="margin-bottom:8px;cursor:default">
    <span class="mat-sw" style="background-image:url(${swatch(id)})"></span>
    <div><div class="mat-nm">${m.name}</div><div class="mat-sub">${m.sub}</div></div></div>`;
}
function delBtn(){ return `<button class="btn danger" id="delBtn" style="width:100%;justify-content:center;margin-top:6px">Delete element</button>`; }

// ── LIBRARY ───────────────────────────────────────────────────────
function renderLib(){
  const b = $('#tab-lib');
  const cats = [...new Set(CATALOG.map(c => c.cat))];
  let h = `<div class="sec"><div class="sec-t">Materials <span class="act" id="applyHint">click to apply</span></div>
    <div class="grid3">${Object.keys(MATS).map(id => `
      <button class="tile" data-libmat="${id}" title="${MATS[id].name} — ${MATS[id].sub}">
        <span class="tsw" style="background-image:url(${swatch(id)})"></span>
        <span class="tnm">${MATS[id].name}</span></button>`).join('')}</div></div>`;
  for (const c of cats){
    h += `<div class="sec"><div class="sec-t">${c}</div><div class="grid2">` +
      CATALOG.filter(i => i.cat === c).map(i => `
        <button class="tile${i.id === pendingSub ? ' on' : ''}" data-item="${i.id}">
          <span class="tico">${libIcon(i.id)}</span>
          <span class="tnm">${i.name}</span>
          <span class="tsz">${U.fmt(i.w)} × ${U.fmt(i.d)}</span></button>`).join('') + `</div></div>`;
  }
  b.innerHTML = h;
  b.querySelectorAll('[data-item]').forEach(x => x.onclick = () => {
    pendingSub = x.dataset.item;
    setTool('furniture');
    renderLib();
    $('#hint').innerHTML = 'Click in the plan or the 3D view to place <b>' + catItem(pendingSub).name + '</b>';
    toast(catItem(pendingSub).name + ' armed — click to place');
  });
  b.querySelectorAll('[data-libmat]').forEach(x => x.onclick = () => {
    const id = x.dataset.libmat;
    const el = selEl();
    beginChange();
    if (el) el.mat = id;
    else if (selRoom){ const r = rooms().find(r => V.dist(r.c, selRoom.c) < 1.5); if (r) setRoomMeta(r, { mat: id }); }
    else floor().floorMat = id;
    commit();
    toast(MATS[id].name + ' applied' + (el ? '' : selRoom ? ' to room floor' : ' as floor default'));
  });
}
function libIcon(id){
  const s = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">';
  const M = {
    'bed-king':'<path d="M2 17v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M2 17h20M4 10V7h16v3M4 17v2M20 17v2"/>',
    'bed-single':'<path d="M4 17v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M4 17h16M6 10V7h12v3"/>',
    'wardrobe':'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M10 12h-1M15 12h-1"/>',
    'nightstand':'<rect x="5" y="7" width="14" height="12" rx="1"/><path d="M8 12h8M8 15h8"/>',
    'sofa':'<path d="M4 12V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 12h20v6H2z"/><path d="M5 18v2M19 18v2"/>',
    'sofa-l':'<path d="M3 8h9v8H3zM12 12h9v8h-9z"/>',
    'armchair':'<path d="M6 12V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><path d="M4 12h16v6H4z"/>',
    'coffee':'<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M6 13v4M18 13v4"/>',
    'tv-unit':'<rect x="3" y="14" width="18" height="6" rx="1"/><rect x="6" y="4" width="12" height="8" rx="1"/>',
    'rug':'<rect x="3" y="6" width="18" height="12" rx="2" stroke-dasharray="3 2"/>',
    'dining':'<circle cx="12" cy="12" r="5"/><circle cx="12" cy="4" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="20" cy="12" r="1.6"/>',
    'chair':'<rect x="7" y="8" width="10" height="9" rx="1"/><path d="M7 5h10v3"/>',
    'island':'<rect x="3" y="8" width="18" height="8" rx="1"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1"/>',
    'counter':'<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M2 12h20"/>',
    'fridge':'<rect x="7" y="2" width="10" height="20" rx="1.5"/><path d="M7 10h10M14 6v2M14 13v2"/>',
    'toilet':'<path d="M8 4h8v4H8z"/><path d="M7 8h10l-1.5 7h-7z"/><path d="M10 15v4h4v-4"/>',
    'basin':'<rect x="4" y="8" width="16" height="8" rx="3"/><path d="M12 4v4"/>',
    'shower':'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 4l16 16M20 4L4 20"/>',
    'bathtub':'<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M6 17v2M18 17v2"/>',
    'desk':'<path d="M3 9h18v3H3z"/><path d="M5 12v8M19 12v8M8 12v4h6v-4"/>',
    'bookshelf':'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 9h14M5 15h14"/>',
    'plant':'<path d="M8 21h8l-1-7H9z"/><path d="M12 14c0-4 2-7 5-8-1 4-2 6-5 8zM12 14c0-4-2-7-5-8 1 4 2 6 5 8z"/>',
    'ac':'<rect x="3" y="7" width="18" height="7" rx="2"/><path d="M7 17c1-1 2-1 3 0M14 17c1-1 2-1 3 0"/>'
  };
  return s + (M[id] || '<rect x="4" y="6" width="16" height="12" rx="2"/>') + '</svg>';
}

// ── LAYERS / FLOORS + VERSIONS ────────────────────────────────────
function addFloor(){
  beginChange();
  const top = P.floors[P.floors.length-1];
  const f = newFloor(P.floors.length);
  f.elevation = top.elevation + Math.max(top.height + 1, DEF.floorH);
  P.floors.push(f);
  P.active = P.floors.length - 1;
  sel = null; selRoom = null;
  commit();
  switchTab('layers');
  toast('Added ' + f.name);
}
function duplicateFloor(){
  beginChange();
  const src = floor();
  const f = JSON.parse(JSON.stringify(src));
  f.id = uid();
  f.name = 'Floor ' + (P.floors.length + 1);
  f.elevation = P.floors[P.floors.length-1].elevation + Math.max(src.height + 1, DEF.floorH);
  f.elements.forEach(e => {
    const old = e.id; e.id = uid();
    f.elements.forEach(o => { if (o.host === old) o.host = e.id; });
  });
  P.floors.push(f);
  P.active = P.floors.length - 1;
  commit();
  renderLayers();
  toast('Floor duplicated');
}
function renderLayers(){
  const b = $('#tab-layers');
  let h = `<div class="sec"><div class="sec-t">Levels <span class="act" id="addFloorBtn">+ Add floor</span></div>`;
  P.floors.forEach((f, i) => {
    const savedActive = P.active; P.active = i;
    const a = detectRooms(f).reduce((s,r) => s + r.area, 0);
    P.active = savedActive;
    h += `<div class="layer${i === P.active ? ' on' : ''}" data-floor="${i}">
      <span class="dot"></span>
      <span class="ln"><span class="lnm">${f.name}</span>
        <span class="lsub">${U.fmtArea(a)} · elev ${U.fmt(f.elevation)}</span></span>
      <span class="eye${f.visible ? '' : ' off'}" data-eye="${i}" title="Show / hide">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
      </span></div>`;
  });
  h += `<div class="grid2" style="margin-top:8px">
      <button class="btn sm" id="dupFloor">Duplicate</button>
      <button class="btn sm danger" id="delFloor">Delete level</button></div></div>`;

  h += `<div class="sec"><div class="sec-t">Display</div>
    ${fToggle('Show ceilings / roof slab', () => showCfg.ceilings, v => { showCfg.ceilings = v; $('#btnCeil').classList.toggle('on', v); })}
    ${fToggle('Show levels above', () => showCfg.above, v => showCfg.above = v)}</div>`;

  const vs = versions();
  h += `<div class="sec"><div class="sec-t">Versions <span class="act" id="saveVer">+ Save version</span></div>`;
  h += vs.length ? vs.map(v => `
    <div class="ver">
      <span class="vth" style="background-image:url(${v.thumb || ''})"></span>
      <span class="vn"><span class="vnm">${v.label}</span><span class="vt">${new Date(v.at).toLocaleString()}</span></span>
      <button class="btn sm" data-restore="${v.id}">Open</button>
    </div>`).join('')
    : `<div class="empty" style="padding:16px 0"><div class="es">No saved versions yet.<br>⌘S saves one any time.</div></div>`;
  h += `</div>`;
  b.innerHTML = h;
  mountFields();

  b.querySelectorAll('[data-floor]').forEach(x => x.onclick = e => {
    if (e.target.closest('[data-eye]')) return;
    P.active = +x.dataset.floor;
    sel = null; selRoom = null;
    $('#floorChip').textContent = floor().name;
    refreshAll(); renderLayers();
  });
  b.querySelectorAll('[data-eye]').forEach(x => x.onclick = e => {
    e.stopPropagation();
    beginChange();
    P.floors[+x.dataset.eye].visible = !P.floors[+x.dataset.eye].visible;
    commit(); renderLayers();
  });
  $('#addFloorBtn').onclick = addFloor;
  $('#dupFloor').onclick = duplicateFloor;
  $('#delFloor').onclick = () => {
    if (P.floors.length < 2){ toast('A project needs at least one level'); return; }
    beginChange();
    P.floors.splice(P.active, 1);
    P.active = clamp(P.active, 0, P.floors.length-1);
    sel = null; commit(); renderLayers();
  };
  $('#saveVer').onclick = () => saveVersion();
  b.querySelectorAll('[data-restore]').forEach(x => x.onclick = async () => {
    // Only the label, date and thumbnail are held in memory; the building
    // itself is fetched when someone actually opens the version.
    let d;
    try { d = (await api.getVersion(x.dataset.restore)).design; }
    catch(e){ toast('Could not open that version'); return; }
    if (disposed) return;
    beginChange();
    P = Object.assign(newProject(), d);
    P.floors.forEach(f => { f.roomMeta = f.roomMeta || []; });
    $('#projName').value = P.name;
    sel = null; selRoom = null;
    commit(); fit2D(); frameScene(); renderLayers();
    toast('Version restored');
  });
}

// ── Stats + global refresh ────────────────────────────────────────
function updateStats(){
  const st = stats();
  $('#sbArea').textContent = U.fmtArea(st.area);
  $('#sbVol').textContent = U.fmtVol(st.vol);
  const oe = openEnds().length;
  $('#stats2d').innerHTML =
    `<span>Rooms <b>${st.count}</b></span><span>Area <b>${U.fmtArea(st.area)}</b></span>` +
    `<span>Walls <b>${walls().length}</b></span><span>Level <b>${floor().name}</b></span>` +
    (oe ? `<span style="color:var(--amber)" title="Wall ends that touch nothing — rooms can't form until they meet">⚠ Open ends <b style="color:var(--amber)">${oe}</b></span>` : '');
}
function refreshAll(){
  invalidateRooms();
  rebuild3D();
  draw2D();
  updateStats();
  renderProps();
  $('#floorChip').textContent = floor().name;
  if (activeTab === 'layers') renderLayers();
}

// ══════════════════════════════════════════════════════════════════
//  IMPORT · EXPORT · SAMPLE · AI
// ══════════════════════════════════════════════════════════════════
function thumbnail(){
  try {
    const c = document.createElement('canvas'); c.width = 132; c.height = 100;
    const x = c.getContext('2d');
    x.fillStyle = PAL.paper; x.fillRect(0,0,132,100);
    if (cv2.width) x.drawImage(cv2, 0, 0, cv2.width, cv2.height, 0, 0, 132, 100);
    return c.toDataURL('image/jpeg', .55);
  } catch(e){ return ''; }
}

// ── Export ────────────────────────────────────────────────────────
function exportGLB(){
  toast('Building glTF…');
  const ex = new GLTFExporter();
  ex.parse(rootBuild, r => {
    download(fileBase() + '.glb', new Blob([r], { type:'model/gltf-binary' }));
    toast('Exported .glb');
  }, e => toast('glTF export failed'), { binary: true, onlyVisible: true });
}
function exportOBJ(){
  const txt = new OBJExporter().parse(rootBuild);
  download(fileBase() + '.obj', new Blob([txt], { type:'text/plain' }));
  toast('Exported .obj');
}
function exportPNG3D(){
  renderer.render(scene, cam);
  cv3.toBlob(b => { download(fileBase() + '-3d.png', b); toast('3D image saved'); });
}
/**
 * Runs `fn` with the plan drawn in day colours, then puts the canvas back.
 *
 * A floor plan that leaves the studio goes onto paper or into a document, so
 * it is always exported light — otherwise night mode would hand you a black A3
 * sheet. Both repaints are synchronous and happen inside one frame, so nothing
 * flickers on screen; the capture inside `fn` has to be synchronous too, which
 * is why the callers grab pixels (`drawImage`, `toDataURL`) rather than waiting
 * on `toBlob` in here.
 */
function onDayPaper(fn){
  const was = PAL;
  if (was === THEMES.day) return fn();
  PAL = THEMES.day; draw2D();
  try { return fn(); }
  finally { PAL = was; draw2D(); }
}
function exportPNG2D(){
  const tmp = document.createElement('canvas');
  tmp.width = cv2.width; tmp.height = cv2.height;
  const x = tmp.getContext('2d');
  x.fillStyle = THEMES.day.paper; x.fillRect(0,0,tmp.width,tmp.height);
  onDayPaper(() => x.drawImage(cv2, 0, 0));
  tmp.toBlob(b => { download(fileBase() + '-plan.png', b); toast('Floor plan saved'); });
}
function exportJSON(){
  P.name = $('#projName').value;
  download(fileBase() + '.json', new Blob([JSON.stringify(P, null, 2)], { type:'application/json' }));
  toast('Project data saved');
}
function fileBase(){
  return ($('#projName').value || 'design').replace(/[^\w\-]+/g,'-').toLowerCase() + '-' + floor().name.replace(/\s+/g,'').toLowerCase();
}
function exportPDF(){
  const st = stats();
  const img = onDayPaper(() => cv2.toDataURL('image/png'));
  const w = open('', '_blank');
  if (!w){ toast('Allow pop-ups to print the sheet'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${P.name} — ${floor().name}</title>
  <style>
    @page{size:A3 landscape;margin:12mm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,system-ui,sans-serif;color:#1c1917;padding:10px}
    .sheet{border:1.5px solid #1c1917;height:calc(100vh - 40px);display:flex;flex-direction:column}
    .plan{flex:1;display:flex;align-items:center;justify-content:center;padding:14px;overflow:hidden}
    .plan img{max-width:100%;max-height:100%;object-fit:contain}
    .tb{border-top:1.5px solid #1c1917;display:flex}
    .cell{padding:8px 14px;border-right:1px solid #1c1917;font-size:11px}
    .cell:last-child{border-right:none}
    .k{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;margin-bottom:3px}
    .v{font-weight:700;font-size:13px}
    .big{flex:1}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="sheet">
    <div class="plan"><img src="${img}"></div>
    <div class="tb">
      <div class="cell big"><div class="k">Project</div><div class="v">${P.name}</div></div>
      <div class="cell"><div class="k">Level</div><div class="v">${floor().name}</div></div>
      <div class="cell"><div class="k">Rooms</div><div class="v">${st.count}</div></div>
      <div class="cell"><div class="k">Floor area</div><div class="v">${U.fmtArea(st.area)}</div></div>
      <div class="cell"><div class="k">Ceiling</div><div class="v">${U.fmt(floor().height)}</div></div>
      <div class="cell"><div class="k">Date</div><div class="v">${new Date().toLocaleDateString()}</div></div>
      <div class="cell"><div class="k">Drawn with</div><div class="v">BD Design Studio</div></div>
    </div>
  </div>
  <script>onload=()=>setTimeout(()=>print(),350)<\/script></body></html>`);
  w.document.close();
}

// ── Import (native project, or a plan from the 2D designer) ───────
const LEGACY_SUB = {
  bed:'bed-king', 'bed-single':'bed-single', sofa:'sofa', 'dining-table':'dining',
  wardrobe:'wardrobe', 'tv-unit':'tv-unit', toilet:'toilet', sink:'basin',
  shower:'shower', bathtub:'bathtub', desk:'desk', chair:'chair'
};
function importData(data){
  beginChange();
  if (Array.isArray(data)){
    // f.html / floorplan.html element array — feet, x/y top-left
    P = newProject('Imported plan');
    const f = P.floors[0];
    const pendingOpenings = [];
    for (const e of data){
      if (e.type === 'room'){
        const x0 = e.x, z0 = e.y, x1 = e.x + e.w, z1 = e.y + e.h;
        const c = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
        for (let i = 0; i < 4; i++)
          f.elements.push({ id: uid(), type:'wall', a: c[i], b: c[(i+1)%4], t: DEF.wallT, h: f.height, mat:'plaster' });
        f.roomMeta.push({ c: [(x0+x1)/2, (z0+z1)/2], name: e.label || e.sub || 'Room', mat: null });
      } else if (e.type === 'wall'){
        f.elements.push({ id: uid(), type:'wall', a:[e.x, e.y], b:[e.x2 !== undefined ? e.x2 : e.x + e.w, e.y2 !== undefined ? e.y2 : e.y], t: DEF.wallT, h: f.height, mat:'plaster' });
      } else if (e.type === 'door' || e.type === 'window'){
        pendingOpenings.push(e);
      } else if (e.type === 'furniture'){
        const sub = LEGACY_SUB[e.sub] || 'chair';
        const c = catItem(sub);
        f.elements.push({ id: uid(), type:'furniture', sub, x: e.x + e.w/2, z: e.y + e.h/2,
          rot: e.angle || 0, w: e.w || c.w, d: e.h || c.d, h: c.h, mat: null, mountY: c.mountY || 0 });
      }
    }
    P.active = 0;
    // host imported doors / windows on the closest wall
    for (const e of pendingOpenings){
      const mid = [e.x + (e.w || 0)/2, e.y + (e.h || 0)/2];
      const hit = wallHit(mid, 3.5);
      if (hit){
        const o = addOpening(e.type, hit.wall, hit.t);
        if (o && e.w > 1) o.w = e.w;
      }
    }
    toast('Imported ' + data.length + ' elements from the 2D designer');
  } else if (data && data.floors){
    P = Object.assign(newProject(), data);
    P.floors.forEach(f => { f.roomMeta = f.roomMeta || []; f.elements = f.elements || []; });
    P.active = clamp(P.active || 0, 0, P.floors.length-1);
    toast('Project loaded');
  } else { toast('Unrecognised file'); return; }
  $('#projName').value = P.name;
  sel = null; selRoom = null;
  commit();
  fit2D(); frameScene();
}
$('#fileIn').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { importData(JSON.parse(r.result)); } catch(err){ toast('Could not read that file'); } };
  r.readAsText(f);
  e.target.value = '';
});

// ── Sample project ────────────────────────────────────────────────
function loadSample(){
  beginChange();
  P = newProject('Modern Villa');
  const f = P.floors[0];
  f.name = 'Floor 1'; f.note = 'Open living area'; f.height = 10;
  const W = (a, b, t) => { const w = { id: uid(), type:'wall', a, b, t: t || DEF.wallT, h: f.height, mat: t ? 'concrete' : 'plaster' }; f.elements.push(w); return w; };

  const A = W([0,0],[44,0], DEF.extWallT);      // north
  const B = W([44,0],[44,32], DEF.extWallT);    // east
  const C = W([44,32],[0,32], DEF.extWallT);    // south
  const D = W([0,32],[0,0], DEF.extWallT);      // west
  const W1 = W([0,18],[44,18]);
  const W2 = W([26,0],[26,18]);
  const W3 = W([17,18],[17,32]);
  const W4 = W([32,18],[32,32]);
  const W5 = W([32,25],[44,25]);

  const OP = (type, wall, off, w, h, sill) => {
    f.elements.push({ id: uid(), type, host: wall.id, off, w, h,
      sill: type === 'window' ? (sill !== undefined ? sill : DEF.winSill) : 0,
      mat: type === 'door' ? 'wood' : 'metal', hinge:'left', swing: 1, open: .5 });
  };
  OP('door',   A,  20, 3.6, 7.2);          // entrance
  OP('window', A,   7, 7,   5.5, 2.6);     // living glazing
  OP('window', A,  34, 5,   4.5, 3);       // kitchen
  OP('window', B,   9, 4,   4.5, 3);
  OP('window', B,  21, 2.6, 3,   4.4);     // bath
  OP('window', C,  36, 6,   4.5, 3);       // bed 1
  OP('window', C,  20, 6,   4.5, 3);       // bed 2
  OP('door',   W1,  8, 3,   7);            // to bed 1
  OP('door',   W1, 24, 3,   7);            // to bed 2
  OP('door',   W2, 13, 4,   7.4);          // kitchen opening
  OP('door',   W4, 3.5, 2.6, 7);           // bath
  OP('door',   W5, 6,  2.6, 7);            // store

  f.roomMeta = [
    { c:[13,9],    name:'Living & Dining', mat:'oak' },
    { c:[35,9],    name:'Kitchen',         mat:'tile' },
    { c:[8.5,25],  name:'Master Bedroom',  mat:'oak' },
    { c:[24.5,25], name:'Bedroom 2',       mat:'oak' },
    { c:[38,21.5], name:'Bath',            mat:'marble' },
    { c:[38,28.5], name:'Store',           mat:'tile' }
  ];

  const FU = (sub, x, z, rot) => {
    const c = catItem(sub);
    f.elements.push({ id: uid(), type:'furniture', sub, x, z, rot: rot || 0, w: c.w, d: c.d, h: c.h, mat: null, mountY: c.mountY || 0 });
  };
  FU('rug', 9, 8);           FU('sofa', 9, 5.4);        FU('coffee', 9, 8.6);
  FU('tv-unit', 9, 12.6, Math.PI);  FU('armchair', 3.6, 9, Math.PI/2);
  FU('dining', 19.5, 11.5); FU('plant', 23, 3);
  FU('counter', 35, 2.4);   FU('island', 35, 9.5);      FU('fridge', 41.5, 15.4, Math.PI);
  FU('bed-king', 8.5, 25.5); FU('nightstand', 4.2, 21.6); FU('nightstand', 12.8, 21.6);
  FU('wardrobe', 1.6, 27, Math.PI/2);
  FU('bed-single', 24, 25.5); FU('desk', 30, 30, Math.PI/2); FU('wardrobe', 21, 30.6, Math.PI);
  FU('toilet', 34, 20);      FU('basin', 34.5, 23.4, Math.PI); FU('shower', 42, 20.4);
  f.elements.push({ id: uid(), type:'stairs', x: 23.6, z: 5.2, rot: 0, w: 3.4, rise: 10.8, run: 9.2, mat:'oak', rail: true });

  // second level — same shell, master suite + terrace
  const f2 = newFloor(1);
  f2.name = 'Floor 2'; f2.note = 'Bedrooms & terrace'; f2.elevation = 11.2; f2.height = 10; f2.floorMat = 'oak';
  const W2_ = (a, b, t) => f2.elements.push({ id: uid(), type:'wall', a, b, t: t || DEF.wallT, h: f2.height, mat: t ? 'concrete' : 'plaster' });
  W2_([0,0],[44,0], DEF.extWallT); W2_([44,0],[44,20], DEF.extWallT);
  W2_([44,20],[0,20], DEF.extWallT); W2_([0,20],[0,0], DEF.extWallT);
  W2_([22,0],[22,20]);
  f2.roomMeta = [{ c:[11,10], name:'Master Suite', mat:'oak' }, { c:[33,10], name:'Bedroom 3', mat:'oak' }];
  const w2walls = f2.elements.filter(e => e.type === 'wall');
  f2.elements.push({ id: uid(), type:'window', host: w2walls[0].id, off: 10, w: 7, h: 5, sill: 2.8, mat:'metal' });
  f2.elements.push({ id: uid(), type:'window', host: w2walls[0].id, off: 33, w: 6, h: 5, sill: 2.8, mat:'metal' });
  f2.elements.push({ id: uid(), type:'door',   host: w2walls[4].id, off: 14, w: 3, h: 7, sill: 0, mat:'wood', hinge:'left', swing:1, open:.5 });
  const FU2 = (sub, x, z, rot) => {
    const c = catItem(sub);
    f2.elements.push({ id: uid(), type:'furniture', sub, x, z, rot: rot || 0, w: c.w, d: c.d, h: c.h, mat: null, mountY: c.mountY || 0 });
  };
  FU2('bed-king', 11, 12); FU2('nightstand', 6.6, 8.2); FU2('nightstand', 15.4, 8.2);
  FU2('wardrobe', 11, 18.2, Math.PI); FU2('bed-single', 33, 12); FU2('desk', 41, 5, Math.PI/2);
  P.floors.push(f2);

  P.active = 0;
  $('#projName').value = P.name;
  sel = null; selRoom = null;
  commit();
  fit2D(); frameScene();
  toast('Sample villa loaded');
}

// ── AI assistant ──────────────────────────────────────────────────
// The standalone tool posted to a throwaway Node server that held a Groq key
// in a .env beside it. Buildora already proxies the same model, server-side
// and rate-limited, at POST /api/projects/:id/floor-plans/advice — so the
// studio uses that and no key is reachable from the browser. The prompt
// below still goes with every question, which is what keeps the answers
// sounding the way they do: feet, Dhaka norms, short dashed lists.
let aiHist = [], aiBusy = false;
const AI_SYS = `You are an architectural design assistant working inside a 3D floor-plan tool used for Bangladeshi homes.
- All sizes in feet.
- Know Dhaka apartment norms: master bed 12x14, bed 10x12, kitchen 8x10, bath 5x7, 9-10 ft ceilings, 5" partition / 10" exterior brick.
- Consider heat, humidity, cross-ventilation, monsoon, south/north light.
- Be concise and specific. Use short dashed lists.`;
function layoutSummary(){
  const rs = rooms();
  if (!rs.length) return 'The plan is empty.';
  return floor().name + ': ' + rs.map(r => r.name + ' ' + Math.round(r.area) + 'sqft').join(', ') +
    '. Total ' + Math.round(stats().area) + ' sqft, ceiling ' + floor().height + ' ft.';
}
function renderAI(){
  const b = $('#tab-ai');
  $('#aiInRow').style.display = 'flex';
  b.innerHTML = `<div class="chip-row">
      <button class="chip" data-q="layout">Suggest a 3-bed layout</button>
      <button class="chip" data-q="review">Review my plan</button>
      <button class="chip" data-q="vent">Ventilation for Dhaka</button>
      <button class="chip" data-q="sizes">Standard BD room sizes</button>
    </div><div class="ai-msgs" id="aiMsgs">
      <div class="ai-m">I can review the plan you've drawn, suggest room sizes, or generate a starter layout. What are we designing?</div>
    </div>`;
  b.querySelectorAll('[data-q]').forEach(c => c.onclick = () => {
    const q = {
      layout: 'Suggest a 3-bedroom layout for a 1400 sqft Dhaka apartment. Give each room with size in feet.',
      review: 'Review this floor plan and list what to improve:\n' + layoutSummary(),
      vent: 'How should I orient rooms and windows in Dhaka for cross-ventilation and to keep the west sun out?',
      sizes: 'List standard room sizes used in Bangladeshi apartments, in feet.'
    }[c.dataset.q];
    $('#aiInput').value = q; sendAI();
  });
}
async function sendAI(){
  const inp = $('#aiInput'), text = inp.value.trim();
  if (!text || aiBusy) return;
  inp.value = '';
  const box = $('#aiMsgs');
  const u = document.createElement('div'); u.className = 'ai-m u'; u.textContent = text; box.appendChild(u);
  const a = document.createElement('div'); a.className = 'ai-m'; a.innerHTML = '<span class="spin"></span>';
  box.appendChild(a); box.scrollTop = 1e9;
  aiHist.push({ role:'user', content: text });
  aiBusy = true; $('#aiSend').disabled = true;
  try {
    // The plan as it currently stands rides along with every question. The
    // advisor endpoint expects that block of measured fact, and an assistant
    // looking at the real drawing gives better advice than one guessing at it.
    const reply = await api.advise(AI_SYS, layoutSummary(), aiHist);
    aiHist.push({ role:'assistant', content: reply });
    a.innerHTML = reply
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/^[-*] (.+)$/gm, '• $1')
      .replace(/\n/g, '<br>');
  } catch(err){
    const offline = /failed|fetch|network/i.test(err.message);
    a.innerHTML = '⚠️ ' + (offline ? 'Cannot reach the advisor.' : err.message) +
      '<br><span style="font-size:11px;color:var(--muted)">Check your connection and ask again.</span>';
  }
  aiBusy = false; $('#aiSend').disabled = false;
  box.scrollTop = 1e9;
}
$('#aiSend').onclick = sendAI;
$('#aiInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendAI(); }
});

// ══════════════════════════════════════════════════════════════════
//  WIRING + BOOT
// ══════════════════════════════════════════════════════════════════
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;
$$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#saveBtn').onclick = () => saveVersion();
$('#projName').oninput = () => { P.name = $('#projName').value; markDirty(); };

// ── Day / night ───────────────────────────────────────────────────
// The button flips the *whole app*, not just the studio: `api.setTheme` goes
// to `store/useTheme`, which owns the `dark` class on <html> and the
// `buildora-theme` key. Anything else would leave the navbar's own toggle out
// of step the moment you left this route, and would go stale in the store.
const SUN  = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';
const themeBtn = $('#themeBtn');

function syncThemeBtn(){
  const night = PAL === THEMES.night;
  // One icon, so it shows the mode you'd get by pressing it rather than the
  // one you are in. (The site's own switch shows both and lights the current
  // one — it has a 68px pill to do that in; this has a 34px square.) The title
  // spells it out either way, because a lone sun is ambiguous on its own.
  themeBtn.innerHTML = night ? SUN : MOON;
  themeBtn.title = night ? 'Switch to day mode' : 'Switch to night mode';
}

function applyTheme(mode){
  PAL = THEMES[mode] || THEMES.day;
  api.setTheme(mode);
  // Materials and lights can be recoloured in place; the grids and the room
  // labels cannot — GridHelper bakes vertex colours and a label is a canvas
  // sprite — so those two get rebuilt instead.
  scene.background.set(PAL.scene);
  scene.fog.color.set(PAL.scene);
  hemi.groundColor.set(PAL.hemiGround);
  ground.material.color.set(PAL.ground);
  HANDLE_E.color.set(PAL.sel3d);
  SEL_FILL.color.set(PAL.sel3d);
  SEL_LINE.color.set(PAL.sel3d);
  buildGrids();
  syncThemeBtn();
  refreshAll();          // repaints the 2D plan and rebuilds the 3D labels
}

themeBtn.onclick = () => applyTheme(PAL === THEMES.night ? 'day' : 'night');
syncThemeBtn();

const menu = $('#mainMenu');
$('#menuBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('on'); };
on(window, 'click', () => menu.classList.remove('on'));
menu.addEventListener('click', e => e.stopPropagation());
menu.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
  menu.classList.remove('on');
  const a = b.dataset.act;
  if (a === 'new'){
    if (!confirm('Start a new empty project? The current one stays in your saved versions if you saved it.')) return;
    beginChange();
    P = newProject(); $('#projName').value = P.name; sel = null; selRoom = null;
    commit(); fit2D(); frameScene();
  }
  else if (a === 'importJson') $('#fileIn').click();
  else if (a === 'sample')     loadSample();
  else if (a === 'glb')        exportGLB();
  else if (a === 'obj')        exportOBJ();
  else if (a === 'png3d')      exportPNG3D();
  else if (a === 'png2d')      exportPNG2D();
  else if (a === 'pdf')        exportPDF();
  else if (a === 'json')       exportJSON();
  else if (a === 'shortcuts')  showShortcuts();
});

function showShortcuts(){
  const rows = [
    ['V / W / R', 'Select · Wall · Room'],
    ['D / N', 'Door · Window'],
    ['S / C / F', 'Stairs · Column · Furniture'],
    ['M', 'Measure'],
    ['1 / 2 / 3', '2D · Split · 3D view'],
    ['R', 'Rotate the selected object 15°'],
    ['⌘Z / ⇧⌘Z', 'Undo · Redo'],
    ['⌘D', 'Duplicate selection'],
    ['⌘S', 'Save a named version'],
    ['Del', 'Delete selection'],
    ['Esc', 'Cancel drawing / clear selection'],
    ['Space-drag', 'Pan — works in both views, with any tool'],
    ['Drag empty space', 'Pan the plan (Select tool)'],
    ['Shift-scroll', 'Scroll the plan sideways'],
    ['Right-drag', 'Orbit in 3D while a tool is active'],
    ['W A S D', 'Move in walk mode']
  ];
  openModal(`<div class="modal-h"><div class="mt">Keyboard shortcuts</div>
    <button class="icon-btn" data-close>✕</button></div>
    <div class="modal-b"><table style="width:100%;border-collapse:collapse">
    ${rows.map(r => `<tr><td style="padding:6px 0;width:130px"><kbd style="background:var(--panel2);border:1px solid var(--line2);border-radius:5px;padding:2px 7px;font-size:11px;font-family:ui-monospace,monospace">${r[0]}</kbd></td>
      <td style="padding:6px 0;color:var(--text2)">${r[1]}</td></tr>`).join('')}
    </table></div>
    <div class="modal-f"><button class="btn primary" data-close>Got it</button></div>`);
}

// 2D overlay buttons
$('#btnGrid').onclick = e => { showCfg.grid = !showCfg.grid; e.currentTarget.classList.toggle('on', showCfg.grid); draw2D(); };
$('#btnDims').onclick = e => { showCfg.dims = !showCfg.dims; e.currentTarget.classList.toggle('on', showCfg.dims); draw2D(); rebuild3D(); };
$('#btnFit2d').onclick = fit2D;
$('#z2dIn').onclick  = () => { cam2.s = clamp(cam2.s*1.25, 2, 90); draw2D(); };
$('#z2dOut').onclick = () => { cam2.s = clamp(cam2.s/1.25, 2, 90); draw2D(); };
$('#btnGrid').classList.toggle('on', showCfg.grid);
$('#btnDims').classList.toggle('on', showCfg.dims);

// 3D overlay buttons
$$('#ov3d [data-cam]').forEach(b => b.onclick = () => setCam(b.dataset.cam));
$('#btnCeil').onclick = e => {
  showCfg.ceilings = !showCfg.ceilings;
  e.currentTarget.classList.toggle('on', showCfg.ceilings);
  rebuild3D();
};
$('#btnShadow').onclick = e => {
  showCfg.shadows = !showCfg.shadows;
  sun.castShadow = showCfg.shadows;
  hemi.intensity = showCfg.shadows ? .5 : .85;
  e.currentTarget.classList.toggle('on', showCfg.shadows);
};
$('#btnWalk').onclick = () => walking ? exitWalk() : enterWalk();
$('#btnHome').onclick = () => frameScene();
$('#btnFull').onclick = () => setView(viewMode === '3d' ? 'split' : '3d');

// Status bar
$('#sbSnapGrid').onclick  = e => { snapCfg.grid  = !snapCfg.grid;  e.currentTarget.classList.toggle('on', snapCfg.grid); draw2D(); };
$('#sbSnapOrtho').onclick = e => { snapCfg.ortho = !snapCfg.ortho; e.currentTarget.classList.toggle('on', snapCfg.ortho); };
$('#sbSnapPoint').onclick = e => { snapCfg.point = !snapCfg.point; e.currentTarget.classList.toggle('on', snapCfg.point); };
$('#gridLbl').parentElement.onclick = () => {
  const sizes = [0.5, 1, 2, 5];
  snapCfg.size = sizes[(sizes.indexOf(snapCfg.size) + 1) % sizes.length];
  $('#gridLbl').textContent = U.fmt(snapCfg.size);
  draw2D();
};
$('#sbUnit').onclick = () => {
  U.unit = U.unit === 'ft' ? 'm' : 'ft';
  P.unit = U.unit;
  $('#unitLbl').textContent = U.unit;
  $('#gridLbl').textContent = U.fmt(snapCfg.size);
  refreshAll();
  if (activeTab === 'lib') renderLib();
  toast('Units: ' + (U.unit === 'm' ? 'metres' : 'feet'));
};

// Resize
on(window, 'resize', () => { resize2D(); resize3D(); });
stageObserver = new ResizeObserver(() => { resize2D(); resize3D(); });
stageObserver.observe($('#stage'));

// ── Boot ──────────────────────────────────────────────────────────
function init(){
  renderRail();
  const had = loadAutosave();
  if (had){ $('#projName').value = P.name; U.unit = P.unit || 'ft'; $('#unitLbl').textContent = U.unit; }
  H.last = snapshot();

  setTool('select');
  switchTab('props');
  setView('3d');
  resize2D(); resize3D();

  if (!had) loadSample(); else { refreshAll(); }
  $('#gridLbl').textContent = U.fmt(snapCfg.size);
  fit2D();
  setCam('orbit');
  updateStats();
  renderProps(true);
  // The chip is the only place read-only access is stated, and it takes the
  // slot the save state would otherwise use.
  if (!canEdit) $('#saveTxt').textContent = 'Read only';

  requestAnimationFrame(() => {
    renderer.render(scene, cam);
    $('#boot').classList.add('off');
    if (had) toast('Restored your last session');
  });
}
init();

// Small scripting hook — handy in the browser console (BDS.project, BDS.rooms(), …)
window.BDS = {
  THREE, scene, renderer, rootBuild, rootGiz,
  get project(){ return P; },
  get selection(){ return selEl(); },
  rooms, stats, byId, floorOf, detectRooms,
  setTool, setView, setCam, rebuild3D, refreshAll, loadSample, importData,
  exportGLB, exportOBJ, exportJSON,
  view2d: { w2s, s2w, fit2D, draw2D, get cam(){ return cam2; } },
  get tool(){ return tool; },
  get selectionId(){ return sel; }
};



// ──────────────────────────────────────────────────────────────────
//  Above this line: Essentials/design3d.html, unchanged.
// ──────────────────────────────────────────────────────────────────

/**
 * Shut the studio down.
 *
 * Order matters: stop drawing, stop listening, then release the GPU. Disposing
 * the renderer while a frame is still queued would render into a dead context.
 */
return function dispose(){
  if (disposed) return;
  disposed = true;

  cancelAnimationFrame(rafId);
  clearTimeout(saveTimer);
  clearTimeout(mirrorTimer);
  clearTimeout(toastT);
  if (stageObserver) stageObserver.disconnect();
  for (const remove of off) remove();

  // Walk mode holds a pointer lock and its own controls; leaving it locked
  // would trap the cursor on whatever page comes next.
  try { exitWalk(); } catch(e){}
  try { controls.dispose(); } catch(e){}

  disposeTree(rootBuild);
  disposeTree(rootGiz);
  disposeTree(ghost);
  for (const label of roomLabels){
    if (label.material.map) label.material.map.dispose();
    label.material.dispose();
  }
  // Materials are cached by id and drawn onto canvases once, so they outlive
  // any single scene and have to be let go by hand — textures included, since
  // disposing a material does not touch the maps hanging off it.
  for (const cache of [_mats, _solid, _shade]){
    for (const id in cache){
      const m = cache[id];
      if (m.map) m.map.dispose();
      m.dispose();
      delete cache[id];
    }
  }
  for (const m of [HANDLE_M, HANDLE_E, SEL_FILL, SEL_LINE]) m.dispose();
  if (scene.environment) scene.environment.dispose();
  pmrem.dispose();
  renderer.dispose();

  if (window.BDS && window.BDS.renderer === renderer) delete window.BDS;
};

}
