import {
  ColumnShape,
  DoorSwing,
  FurnitureKind,
  HingeSide,
  OpeningKind,
  PlanMaterial,
  RoomKind,
  StairRailSide,
  type FloorPlanInput,
  type PlanColumn,
  type PlanFurniture,
  type PlanOpening,
  type PlanRoom,
  type PlanStair,
  type PlanWall,
  type StudioElement,
  type StudioPoint,
} from "@buildora/shared";

/**
 * The bridge from what the studio draws to what Buildora measures.
 *
 * The 3D studio owns the drawing and saves it in its own format. But three
 * features read floor plans rather than designs — the DAP/FAR compliance
 * check, the cost estimate's "drawn area" rung, and the Bill of Quantities
 * that prices a tender off built area. All three read `FloorPlan` documents,
 * and none of them should have to learn a second geometry format to keep
 * working.
 *
 * So every studio save is followed by a mirror: each level is translated into
 * a `FloorPlanInput` and written through the floor-plan endpoint that already
 * exists. The studio stays the single place anyone draws; `FloorPlan` stays
 * the single place the platform measures.
 *
 * **This is best-effort by design.** Every value below is clamped or dropped to
 * fit the floor-plan API's validation, because the studio's own limits are
 * wider in places — it will let you draw a 1-inch wall, and a plan will not
 * accept one under 2 inches. A mirror that failed would otherwise take a
 * perfectly good drawing down with it, so anything that cannot be represented
 * is left out rather than allowed to reject the save. The caller swallows
 * mirror errors for the same reason.
 */

/**
 * One room as the studio's `detectRooms()` reports it: a polygon in feet,
 * walked out of the wall graph. Rooms have no ids in the studio — they are
 * derived fresh whenever the walls change — which is why one is minted here.
 */
export interface StudioMirrorRoom {
  poly: StudioPoint[];
  area: number;
  name: string;
}

/** One level, ready to mirror: the floor's own settings plus what is on it. */
export interface StudioMirrorFloor {
  /** Index into the studio's floor list. 0 is the ground floor. */
  level: number;
  /** Floor-to-ceiling height in feet. */
  height: number;
  floorMat: string;
  ceilMat: string;
  showCeiling: boolean;
  gridStepFt: number;
  elements: StudioElement[];
  rooms: StudioMirrorRoom[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A number from the drawing, or the studio's own fallback for it.
 *
 * Most of an element's fields are optional, because the studio reads them that
 * way — an absent wall thickness means "the default partition", an absent
 * swing means "inward". The fallbacks below are the same ones the engine
 * applies when it draws, so the mirror measures the building the architect is
 * actually looking at.
 */
const num = (v: number | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * The studio's own defaults, copied from `DEF` in design3dEngine.js.
 *
 * They are duplicated rather than imported because the engine is a plain
 * JavaScript module with no exports but `boot()` — reaching into it for a
 * constant would mean changing the one file this port exists to leave alone.
 * They are also stable: Dhaka floor-to-ceiling, a 5" partition, a 3x7 door.
 */
const DEFAULTS = {
  wallH: 9.5,
  wallT: 0.42,
  doorW: 3.0,
  doorH: 7.0,
  winW: 4.0,
  winH: 4.0,
  winSill: 3.0,
  floorH: 10.5,
};

/** The floor-plan API's array caps, which the studio does not share. */
const CAP = { walls: 400, rooms: 120, openings: 400, furniture: 300, stairs: 20, columns: 200 };

/**
 * The studio's finish ids against Buildora's. The two lists are the same
 * eighteen finishes — `PlanMaterial` was written from this catalogue — so the
 * mapping is total and nothing is lost either way.
 */
const MATERIAL: Record<string, PlanMaterial> = {
  plaster: PlanMaterial.PLASTER,
  paintWarm: PlanMaterial.WARM_WHITE,
  concrete: PlanMaterial.CONCRETE,
  brick: PlanMaterial.BRICK,
  oak: PlanMaterial.OAK,
  walnut: PlanMaterial.WALNUT,
  marble: PlanMaterial.MARBLE,
  tile: PlanMaterial.CERAMIC_TILE,
  terracotta: PlanMaterial.TERRACOTTA,
  grass: PlanMaterial.GRASS,
  deck: PlanMaterial.DECK,
  mosaic: PlanMaterial.MOSAIC,
  glass: PlanMaterial.GLASS,
  metal: PlanMaterial.MATTE_BLACK,
  steel: PlanMaterial.BRUSHED_STEEL,
  fabric: PlanMaterial.FABRIC_BEIGE,
  fabricD: PlanMaterial.FABRIC_GREY,
  wood: PlanMaterial.OAK_FURNITURE,
};

/**
 * The studio's catalogue ids against `FurnitureKind`. Also total — the enum
 * was extended with exactly these twenty-three items.
 */
const FURNITURE: Record<string, FurnitureKind> = {
  "bed-king": FurnitureKind.BED_DOUBLE,
  "bed-single": FurnitureKind.BED_SINGLE,
  wardrobe: FurnitureKind.WARDROBE,
  nightstand: FurnitureKind.NIGHTSTAND,
  sofa: FurnitureKind.SOFA,
  "sofa-l": FurnitureKind.SECTIONAL_SOFA,
  armchair: FurnitureKind.ARMCHAIR,
  coffee: FurnitureKind.COFFEE_TABLE,
  "tv-unit": FurnitureKind.TV_UNIT,
  rug: FurnitureKind.AREA_RUG,
  dining: FurnitureKind.DINING_TABLE,
  chair: FurnitureKind.CHAIR,
  island: FurnitureKind.KITCHEN_ISLAND,
  counter: FurnitureKind.COUNTER_RUN,
  fridge: FurnitureKind.REFRIGERATOR,
  toilet: FurnitureKind.TOILET,
  basin: FurnitureKind.SINK,
  shower: FurnitureKind.SHOWER,
  bathtub: FurnitureKind.BATHTUB,
  desk: FurnitureKind.DESK,
  bookshelf: FurnitureKind.BOOKSHELF,
  plant: FurnitureKind.PLANTER,
  ac: FurnitureKind.SPLIT_AC,
};

/**
 * The room type behind a studio room's name.
 *
 * The studio names rooms from their area (`guessRoomName`) and lets the
 * architect rename them freely, so this reads the name rather than a field
 * that does not exist. It only tints the drawing and tells the advisor what it
 * is looking at — area, and so the FAR check, does not depend on it.
 */
function roomKindFromName(name: string): RoomKind | undefined {
  const n = name.toLowerCase();
  if (n.includes("bed")) return RoomKind.BEDROOM;
  if (n.includes("bath") || n.includes("toilet") || n.includes("wc")) return RoomKind.BATHROOM;
  if (n.includes("kitchen")) return RoomKind.KITCHEN;
  if (n.includes("dining")) return RoomKind.DINING;
  if (n.includes("living") || n.includes("lounge") || n.includes("drawing")) return RoomKind.LIVING;
  if (n.includes("balcony") || n.includes("veranda") || n.includes("terrace"))
    return RoomKind.BALCONY;
  if (n.includes("corridor") || n.includes("hall") || n.includes("lobby") || n.includes("stair"))
    return RoomKind.CORRIDOR;
  if (n.includes("store") || n.includes("utility") || n.includes("pantry")) return RoomKind.STORE;
  return undefined;
}

/** Radians on the plan → whole degrees clockwise, which is what plans use. */
function degrees(radians: number): number {
  const deg = Math.round((radians * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

const materialOf = (id: string | null | undefined) => (id ? MATERIAL[id] : undefined);

/** Plan-space length of a mirrored wall, for the opening-fit checks below. */
const lengthOf = (a: StudioPoint, b: StudioPoint) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Translate one studio level into a floor plan.
 *
 * The studio's plan coordinates are `(x, z)` with x to the right and z down the
 * page; a floor plan's are `(x, y)` with exactly the same orientation, so the
 * axes map straight across with no flip. Both are in feet.
 */
export function studioFloorToPlanInput(floor: StudioMirrorFloor): FloorPlanInput {
  const walls: PlanWall[] = [];
  const openings: PlanOpening[] = [];
  const furniture: PlanFurniture[] = [];
  const stairs: PlanStair[] = [];
  const columns: PlanColumn[] = [];
  const rooms: PlanRoom[] = [];

  // Ceiling height first — the opening checks below measure against it.
  const ceilingHeightFt = clamp(num(floor.height, DEFAULTS.wallH), 6, 20);

  // Walls, indexed as we go so an opening can find the wall it was cut into
  // and be dropped if that wall did not survive the caps above.
  const wallById = new Map<string, { lengthFt: number; heightFt: number }>();
  for (const el of floor.elements) {
    if (el.type !== "wall" || walls.length >= CAP.walls) continue;
    const heightFt = clamp(num(el.h, num(floor.height, DEFAULTS.wallH)), 1, 30);
    walls.push({
      id: el.id,
      x1: el.a[0],
      y1: el.a[1],
      x2: el.b[0],
      y2: el.b[1],
      // The studio holds thickness in feet; a plan specifies walls the way a
      // builder does — a 5" partition, a 10" exterior wall.
      thicknessIn: clamp(num(el.t, DEFAULTS.wallT) * 12, 2, 24),
      heightFt,
      material: materialOf(el.mat),
    });
    wallById.set(el.id, { lengthFt: lengthOf(el.a, el.b), heightFt });
  }

  for (const el of floor.elements) {
    if (openings.length >= CAP.openings) break;
    if (el.type !== "door" && el.type !== "window") continue;

    const host = wallById.get(el.host);
    if (!host) continue;

    const isDoor = el.type === "door";
    const widthFt = num(el.w, isDoor ? DEFAULTS.doorW : DEFAULTS.winW);
    const heightFt = num(el.h, isDoor ? DEFAULTS.doorH : DEFAULTS.winH);
    const sillFt = num(el.sill, isDoor ? 0 : DEFAULTS.winSill);

    // The one real difference between the two formats: the studio measures an
    // opening from the wall's start to the *centre* of the hole, a plan
    // measures to its near jamb.
    const offsetFt = num(el.off, widthFt / 2) - widthFt / 2;
    if (offsetFt < 0 || offsetFt + widthFt > host.lengthFt + 0.01) continue;
    if (sillFt + heightFt > host.heightFt + 0.01) continue;

    openings.push({
      id: el.id,
      wallId: el.host,
      offsetFt,
      widthFt,
      kind: isDoor ? OpeningKind.DOOR : OpeningKind.WINDOW,
      heightFt: clamp(heightFt, 1, 12),
      sillFt: clamp(sillFt, 0, 10),
      hinge: el.hinge === "right" ? HingeSide.RIGHT : HingeSide.LEFT,
      swing: num(el.swing, 1) < 0 ? DoorSwing.OUT : DoorSwing.IN,
      // The studio holds "how far open" as a fraction; a plan holds the angle.
      openDeg: clamp(Math.round(num(el.open, 0.55) * 90), 0, 120),
      frameMaterial: materialOf(el.mat),
    });
  }

  for (const el of floor.elements) {
    if (el.type === "furniture" && furniture.length < CAP.furniture) {
      // Kit models (a `sub` with a slash — "fur/chair", "nat/tree_default")
      // have no `FurnitureKind`, so they fall out here along with any other
      // unknown catalogue id. That is the right outcome and not a gap: a plan
      // is what the FAR check, the estimate and the BOQ measure, and none of
      // the three prices a tree or a crate. What they measure is the rooms,
      // which the walls above already carried across.
      const kind = FURNITURE[el.sub];
      if (!kind) continue;
      const w = num(el.w, 2);
      const d = num(el.d, 2);
      furniture.push({
        id: el.id,
        kind,
        // A plan places furniture by the top-left corner of its unrotated box;
        // the studio places it by its centre.
        x: num(el.x, 0) - w / 2,
        y: num(el.z, 0) - d / 2,
        widthFt: clamp(w, 0.5, 60),
        depthFt: clamp(d, 0.5, 60),
        rotation: degrees(num(el.rot, 0)),
        heightFt: clamp(num(el.h, 2), 0.2, 12),
        mountFt: clamp(num(el.mountY, 0), 0, 12),
        material: materialOf(el.mat),
      });
    } else if (el.type === "stairs" && stairs.length < CAP.stairs) {
      // Same corner-versus-centre difference as furniture, along the run.
      const w = num(el.w, 3.6);
      const run = num(el.run, DEFAULTS.floorH);
      stairs.push({
        id: el.id,
        x: num(el.x, 0) - w / 2,
        y: num(el.z, 0) - run / 2,
        widthFt: clamp(w, 2, 12),
        runFt: clamp(run, 3, 40),
        rotation: degrees(num(el.rot, 0)),
        riseFt: clamp(num(el.rise, DEFAULTS.floorH), 3, 25),
        // The studio rails a stair unless told otherwise — `el.rail !== false`.
        railSide: el.rail === false ? StairRailSide.NONE : StairRailSide.BOTH,
        material: materialOf(el.mat),
      });
    } else if (el.type === "column" && columns.length < CAP.columns) {
      // Columns are the one thing both formats place by its centre.
      columns.push({
        id: el.id,
        x: num(el.x, 0),
        y: num(el.z, 0),
        sizeFt: clamp(num(el.w, 1.2), 0.5, 5),
        shape: el.shape === "round" ? ColumnShape.ROUND : ColumnShape.SQUARE,
        heightFt: clamp(num(el.h, num(floor.height, DEFAULTS.wallH)), 1, 30),
        material: materialOf(el.mat),
      });
    }
  }

  floor.rooms.forEach((room, i) => {
    // A plan takes 3 to 60 corners. Trimming a polygon would change its area
    // and therefore the FAR, so an over-complex room is skipped instead —
    // which in practice never happens on a residential floor.
    if (room.poly.length < 3 || room.poly.length > 60) return;
    if (rooms.length >= CAP.rooms) return;
    const name = (room.name || "Room").slice(0, 40);
    rooms.push({
      // Detected rooms have no identity of their own, so one is minted from
      // the level and position in the list. It only has to be unique within
      // the floor and stable across a single save.
      id: `studio-${floor.level}-${i}`,
      name,
      points: room.poly.map(([x, y]) => ({ x, y })),
      kind: roomKindFromName(name),
    });
  });

  const plan: FloorPlanInput = {
    level: floor.level,
    walls,
    rooms,
    openings,
    furniture,
    stairs,
    columns,
    gridStepFt: clamp(num(floor.gridStepFt, 1), 0.25, 10),
    ceilingHeightFt,
    // The studio has no slab-thickness control, so the plan keeps its default.
    slabThicknessFt: 0.5,
    floorMaterial: materialOf(floor.floorMat),
    ceilingMaterial: materialOf(floor.ceilMat),
    showCeiling: floor.showCeiling,
  };
  return plan;
}
