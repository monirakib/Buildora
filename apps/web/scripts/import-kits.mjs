/**
 * Import Kenney's model kits into the Design Studio's asset folder.
 *
 * Reads `Essentials/Kits/*` (the kits exactly as they download from
 * kenney.nl) and writes `apps/web/public/kits/`:
 *
 *   kits/manifest.json      every model's id, name, group and size
 *   kits/LICENSE.txt        Kenney's CC0 notice, kept with the assets
 *   kits/<kit>/models/*.glb the models the studio loads
 *   kits/<kit>/thumbs/*.png the tile pictures the Library shows
 *
 * Run it once after adding or updating a kit:  node scripts/import-kits.mjs
 *
 * Note that `Essentials/` is gitignored, so the 73 MB of source kits never
 * reach the repository — only the 13 MB this writes does. Re-running it means
 * fetching the kits from kenney.nl again first.
 *
 * The only part of this that is more than file copying is the size table. A
 * model is placed in the studio by its footprint in feet, so every model's
 * bounding box is measured here rather than at load time — that way the plan
 * view can draw an item the moment it is placed, without waiting for a
 * download. Sizes are read straight out of the GLB header: glTF stores each
 * mesh's min/max corner, and the node tree above it stores the transforms, so
 * measuring is a walk of the tree rather than a render.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const SRC = join(REPO, "Essentials", "Kits");
const OUT = join(HERE, "..", "public", "kits");

/** Kenney authors these kits in metres; the studio's geometry is in feet. */
const FT_PER_M = 3.28084;

/**
 * A standard door leaf, 6'-11" — the ruler every kit below is measured against.
 *
 * The four kits are not drawn at one scale. Kenney draws each to suit its own
 * game, so dropping them into a building at their authored size would put a
 * two-and-a-half-foot door next to an eight-foot one. Each kit therefore
 * carries a `scale` (see KITS), and each of those numbers is this height
 * divided by the same thing measured in that kit.
 */
const DOOR_FT = 6.89;

/** Groups smaller than this are folded into "Misc" so the Library stays short. */
const MIN_GROUP = 3;

/**
 * The longest id the API will store.
 *
 * A placed model saves as a furniture element whose `sub` is the id built
 * here, and `studio.controller.ts` caps that field. Kenney picks the
 * filenames, so a future kit could ship a longer one than any of today's —
 * and the only symptom would be an architect's autosave failing after the
 * model was already placed. Better to stop at import.
 */
const MAX_ID = 80;

/**
 * The models that do not stand on the floor, and how high off it they start.
 *
 * A mirror or a wall cabinet placed at floor level is simply wrong, and the
 * studio has no way to know which is which — a model is a mesh and a name. So
 * the handful that genuinely hang are named here, and everything else defaults
 * to standing on the floor. The architect can still move any of them: the
 * Placement panel's "Mount height" is editable on every item, so being wrong
 * about one of these costs a drag of a number rather than a stuck object.
 *
 * A number is feet above the floor. "ceiling" means the model hangs from the
 * ceiling, and the height is worked out when it is placed — `floor().height`
 * varies per level, so a fixed number would be wrong on any storey the
 * architect gave a different ceiling to.
 *
 * The heights are the ordinary ones: a wall cabinet clears a 3.07 ft base unit
 * by the standard 18 inches, and an extractor hood clears the cooktop by two
 * feet.
 */
const MOUNTS = [
  [/^fur\/kitchenCabinetUpper/, 4.6],   // above the 3.07 ft base cabinets
  [/^fur\/hood(Large|Modern)$/, 4.8],   // over a stove of the same height
  [/^fur\/bathroomMirror$/, 3.4],       // above the basin, top at eye level
  [/^fur\/lampWall$/, 5.5],             // sconce
  [/^fur\/coatRack$/, 4.5],             // the wall-hung one; coatRackStanding is not
  [/^fur\/ceilingFan$/, "ceiling"],
  [/^fur\/lampSquareCeiling$/, "ceiling"],
];

const mountOf = (id) => MOUNTS.find(([re]) => re.test(id))?.[1];

// ── Superclasses ─────────────────────────────────────────────────────
//
// Fifteen hundred models in a flat list is a warehouse, not a library. They
// are filed on the two axes a home designer actually browses by — the same
// pair HomeByMe splits into its "Decorate" and "Furnish" tabs:
//
//   TYPE — what the thing *is*.     Seating, Storage, Lighting, Structure…
//   ROOM — where it *goes*.         Bedroom, Kitchen, Outdoor, Site…
//
// Both are rule tables read top to bottom, first match wins, tested against
// the full id ("fur/bedDouble", "food/plate"). Order matters and the specific
// cases come first — `kitchenCabinet` has to be caught by the kitchen rule
// before the general cabinet rule sees it. Anything that matches nothing at
// all falls through to the last entry, which is why both tables end with a
// catch-all rather than leaving a model unfiled.
//
// These are deliberately data, not code: adding a kit means adding rows here,
// and the Library picks the change up with no work of its own.

// What a thing *is* is almost always its first word. Kenney names a model for
// the object and then qualifies it — `lamp-wall` is a lamp, `rug-doormat` is a
// rug, `bookcase-closed-doors` is a bookcase, `wall-window-wide` is a wall. So
// these rules anchor on `/`, which after flattening means "the name begins
// with". Matching anywhere in the name instead files the wall lamp as masonry
// and the doormat as a door, which is exactly what it did before.
//
// A second, looser tier at the bottom catches names whose leading word nothing
// recognises, by looking for a known word anywhere.
const TYPE_RULES = [
  // whole kits, and things no qualifier can change
  [/^chr\//, "People"],
  [/^car\/(wheel|debris|tire)/, "Tools & Equipment"],
  [/^car\//, "Vehicles"],
  [/^food\//, "Food & Tableware"],
  [/\/(ambulance|tractor|kart|firetruck|police|taxi|van|sedan|suv|hatchback|truck|delivery|race)/, "Vehicles"],

  // structure
  [/\/(stairs|staircase|ramp|ladder)/, "Structure"],
  [/\/(wall|window|door|doorway|roof|floor|column|border|gutter|plating|railing|pillar|scaffolding|panel|planks|beam|arch)/, "Structure"],
  [/^mod\//, "Buildings"],
  [/\/building/, "Buildings"],

  // ground, roads and the site
  [/\/(road|path|driveway|pavement|kerb|curb|crossing|traffic|construction|bridge|electricity|streetlight|signpost|sign)/, "Roads & Site"],
  [/\/(ground|terrain|cliff|tile|snow|water|sand|dirt|hill|slope)/, "Terrain"],
  [/\/(rock|stone|log|stump|mushroom|cactus|bush|hedge)/, "Outdoor & Garden"],
  [/\/(tree|plant|flower|grass|crop|planter|potted|garden|leaf|leaves)/, "Outdoor & Garden"],
  [/\/(fence|gate|canoe|tent|campfire|bedroll|firewood)/, "Outdoor & Garden"],

  // fittings — kitchen and bath before the generic furniture words
  [/\/(kitchen|hood|stove|oven|cooker|cooking|pot|pan|utensil|toaster|blender|microwave|fridge|freezer)/, "Kitchen"],
  [/\/(bathroom|toilet|shower|bathtub|bidet|basin|washbasin)/, "Bathroom"],
  [/\/(washer|dryer|laundry|television|computer|laptop|monitor|screen|radio|speaker|keyboard|mouse|console|ceiling-fan)/, "Appliances & Electronics"],

  // furniture proper
  [/\/(sofa|couch|chair|stool|bench|lounge|seat|ottoman|armchair)/, "Seating"],
  [/\/(table|desk|workbench|counter|island|bar)/, "Tables & Desks"],
  [/\/(bed|mattress|pillow|cushion|blanket|cot|crib|bunk)/, "Beds & Bedding"],
  [/\/(wardrobe|closet|cabinet|bookcase|shelf|shelving|drawer|dresser|sideboard|crate|barrel|box|chest|locker|pallet|dumpster|bin|trashcan)/, "Storage"],
  [/\/(lamp|light|lantern|candle|chandelier|sconce|torch)/, "Lighting"],

  // consumables, tools and props
  [/\/(plate|bowl|cup|mug|glass|cutlery|fork|knife|spoon|bottle|jar|tray)/, "Food & Tableware"],
  [/\/(tool|hammer|saw|axe|shovel|wrench|drill|toolbox|metal|resource)/, "Tools & Equipment"],
  [/\/(rug|carpet|doormat|curtain|mirror|picture|frame|painting|clock|vase|book|statue|figurine|present|gift|wreath|sock|snowflake|ornament|decor|coat|hat|flag|banner|toy|ball)/, "Decor & Accessories"],

  // ── looser tier: the leading word meant nothing, so look anywhere ──
  [/-(stairs|ramp|ladder|door|window|wall|roof|column)/, "Structure"],
  [/-(tree|plant|flower|grass|fence|rock|stone)/, "Outdoor & Garden"],
  [/-(chair|sofa|bench|stool)/, "Seating"],
  [/-(table|desk)/, "Tables & Desks"],
  [/-(lamp|light)/, "Lighting"],
  // The prototype kit is massing blocks and shapes; whatever is left of it is
  // building fabric rather than ornament.
  [/^pro\//, "Structure"],
  [/./, "Decor & Accessories"],
];

const ROOM_RULES = [
  // things that are not in a room at all
  [/^chr\//, "Site & Context"],
  [/^(sub|road|mod)\//, "Site & Context"],
  [/(^|\/|-)(road|driveway|pavement|kerb|curb|traffic|construction|bridge|electricity|signpost)/, "Site & Context"],
  [/(^|\/|-)(stairs|staircase|ramp|ladder|doorway|column|border|gutter|plating|scaffolding|beam)/, "Structure"],
  [/^(bld|pro)\//, "Structure"],
  // Anchored the same way the type rules are: a bookcase with doors is still a
  // bookcase, and a wall lamp is still a lamp.
  [/\/(wall|roof|window|door)/, "Structure"],

  // outside
  [/^(nat|sur)\//, "Outdoor & Garden"],
  [/(^|\/|-)(tree|plant|flower|grass|crop|planter|garden|fence|gate|rock|stone|cliff|ground|terrain|tent|campfire|canoe|bush|hedge|mushroom|log|stump)/, "Outdoor & Garden"],
  [/^car\//, "Garage & Driveway"],
  [/(^|\/|-)(ambulance|tractor|kart|firetruck|police|taxi|van|sedan|suv|hatchback|truck|delivery|race|wheel)/, "Garage & Driveway"],

  // inside, most specific first
  // `pan` needs its ending pinned down or it swallows "paneling".
  [/(^|[/-])(kitchen|hood|stove|oven|cooker|cooking|pot|pans?|utensil|toaster|blender|microwave|fridge|freezer)([/-]|$)/, "Kitchen"],
  [/^food\//, "Kitchen"],
  [/(^|\/|-)(plate|bowl|cup|mug|cutlery|fork|knife|spoon|tray)/i, "Dining"],
  [/(^|\/|-)(bathroom|toilet|shower|bathtub|bidet|basin|washbasin|towel)/i, "Bathroom"],
  [/(^|\/|-)(washer|dryer|laundry|ironing)/i, "Laundry & Utility"],
  [/(^|[/-])(desk|computer|laptop|monitor|keyboard|mouse|bookcase|office)/, "Office"],
  [/(^|[/-])(crib|cot|bunk|toy|kids|child|teddy|bear)/, "Kids room"],
  [/(^|[/-])(bed|mattress|wardrobe|closet|dresser|nightstand|pillow|blanket)/, "Bedroom"],
  // A dining table is a table with company; a coffee table is living-room
  // furniture. Both start with "table", so the qualifier decides and this
  // pair has to come before the bare seating and table rules below.
  [/(^|[/-])(dining|tablecloth)/, "Dining"],
  [/(^|[/-])table-(coffee|side)/, "Living room"],
  [/(^|[/-])(sofa|couch|lounge|armchair|ottoman|television|speaker|radio|rug)/, "Living room"],
  [/(^|[/-])(table|chair|stool|bar)/, "Dining"],
  [/(^|[/-])(coat|umbrella|shoe|doormat|key|mirror)/, "Entry & Hall"],
  // Street furniture — awnings, benches, bins, signage. Whatever is left of
  // the street kit once the shopfront structure above has taken its share
  // belongs outside rather than in the "Anywhere" bucket.
  [/^(urb|hol)\//, "Outdoor & Garden"],

  // furniture and decoration that genuinely belongs anywhere
  [/./, "Anywhere"],
];

/**
 * Match an id against a rule table.
 *
 * The id is flattened first, because the kits do not agree on how they join
 * words: the furniture kit writes `cabinetBedDrawer`, the building kits write
 * `wall-window-wide`, nature writes `cliff_blockCave_stone`. Turning all three
 * into one dash-separated lower-case form is what lets a single rule like
 * `-bed` find the bed in `cabinetBedDrawer` as well as in `bed-single`.
 * Without it every rule would silently only ever match the *first* word of a
 * camelCase name.
 */
const flatten = (id) =>
  id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();

const classify = (rules, id) => {
  const flat = flatten(id);
  return (rules.find(([re]) => re.test(flat)) || [, ""])[1];
};

/**
 * The four kits, and where each one keeps its parts.
 *
 * `models` and `thumbs` differ per kit because Kenney's downloads are not laid
 * out the same way: the two building kits ship square renders in `Previews/`,
 * while furniture and nature ship four isometric angles per model in
 * `Isometric/`, of which we take the north-east one.
 *
 * `scale` brings each kit to building scale, measured rather than guessed —
 * the comment on each one says against what.
 */
const KITS = [
  {
    id: "bld",
    name: "Building",
    dir: "kenney_building-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Walls, roofs, windows and facade parts",
    // Already drawn at building scale: its wall stands 7.87 ft and its door
    // 6.89 ft, which is a storey and a door leaf. Nothing to correct.
    scale: 1,
  },
  {
    id: "fur",
    name: "Furniture",
    dir: "kenney_furniture-kit",
    models: "Models/GLTF format",
    thumbs: "Isometric",
    thumbSuffix: "_NE",
    blurb: "Beds, seating, kitchen, bath and storage",
    // `doorway` is 3.31 ft tall. At the resulting 2.08 the double bed lands at
    // 6.5 x 7.7 ft and the fridge at 2.9 x 6.3 ft, both within an inch or two
    // of the studio's own King Bed and Refrigerator.
    scale: DOOR_FT / 3.31,
  },
  {
    id: "nat",
    name: "Nature",
    dir: "kenney_nature-kit",
    models: "Models/GLTF format",
    thumbs: "Isometric",
    thumbSuffix: "_NE",
    blurb: "Trees, plants, rocks, fences and terrain",
    // No door anywhere in a nature kit. It is measured instead by its ground
    // tile, which is the same 3.28 ft square as the prototype kit's floor —
    // the two kits are built on one grid, so they take one factor.
    scale: DOOR_FT / 2.62,
  },
  {
    id: "pro",
    name: "Prototype",
    dir: "kenney_prototype-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Blocks, ramps, stairs and massing shapes",
    // `door-rotate` is 2.62 ft tall. The 2.63 that falls out of it is confirmed
    // by the kit's own figurine, which then stands 6.05 ft — a person.
    scale: DOOR_FT / 2.62,
  },
  {
    id: "food",
    name: "Food",
    dir: "kenney_food-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Tableware, cookware and food for kitchen scenes",
    // No door in a food kit. Measured off its dinner plate, which is 2.93
    // units for a real 11 inches. The mug then lands at 4", the bowl at 7"
    // and the frying pan at 9" — all right.
    scale: 0.92 / 2.93,
  },
  {
    id: "urb",
    name: "Street",
    dir: "kenney_retro-urban-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Shopfronts, awnings, benches and street furniture",
    // `door-type-a` is 2.06 ft. The resulting 3.34 puts its storey wall at
    // 11 ft and its bench at 6.6 ft long.
    scale: DOOR_FT / 2.06,
  },
  {
    id: "sur",
    name: "Outdoor",
    dir: "kenney_survival-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Camping, tools, firewood and rough outdoor gear",
    // Measured off the barrel, 1.13 units for a real 2.9 ft. The fence then
    // stands 4.4 ft and the bedroll runs 5.1 ft.
    scale: 2.9 / 1.13,
  },
  {
    id: "sub",
    name: "Neighbourhood",
    dir: "kenney_city-kit-suburban",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Whole houses and plots, for the buildings around a site",
    // Shares the roads kit's scale below — they are drawn to go together, so
    // giving them one factor is what keeps a house sitting correctly on a
    // street. At 7.32 a house is 34 x 27 ft and 20 ft tall, and the kit's
    // large tree is 18 ft.
    scale: 24 / 3.28,
  },
  {
    id: "road",
    name: "Roads",
    dir: "kenney_city-kit-roads",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Roads, junctions, kerbs, poles and site works",
    // The anchor for both city kits: one road tile is a 24 ft two-lane
    // carriageway. That also puts the traffic cone at 2.3 ft and the bridge
    // pillar at 12 ft.
    scale: 24 / 3.28,
  },
  {
    id: "car",
    name: "Vehicles",
    dir: "kenney_car-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Cars and trucks, for driveways and for scale",
    // The one kit where no single number is right: Kenney draws these stubby,
    // so matching a real 15 ft length would make them 8.8 ft wide, and
    // matching a real 6 ft width would leave them 10 ft long. This is the
    // geometric mean of those two, giving a 7.3 x 12.4 ft car — chunky, but
    // it neither overhangs a driveway nor reads as a toy.
    scale: Math.sqrt((6 / 4.92) * (15 / 8.37)),
  },
  {
    id: "hol",
    name: "Festive",
    dir: "kenney_holiday-kit",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Lights, wreaths, gifts and seasonal decoration",
    // `cabin-door-rotate` is 3.28 ft tall.
    scale: DOOR_FT / 3.28,
  },
  {
    id: "mod",
    name: "Facades",
    dir: "kenney_modular-buildings",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Stackable facade, window and roof blocks for massing",
    // These are storey-height modules: the block is 2.05 units tall for what
    // should read as a 10 ft floor, which makes each one a 16 ft bay.
    scale: 10 / 2.05,
  },
  {
    id: "chr",
    name: "People",
    dir: "kenney_blocky-characters",
    models: "Models/GLB format",
    thumbs: "Previews",
    thumbSuffix: "",
    blurb: "Figures to put a human scale in a view",
    // The character is 8.86 units for a person of 5 ft 9. They come out
    // broad-shouldered at that factor, which is what "blocky" means.
    scale: 5.75 / 8.86,
  },
];

// ── Reading a GLB ────────────────────────────────────────────────────
// A .glb is a 12-byte header followed by chunks; the first chunk is the glTF
// JSON. That JSON is all we need — the mesh positions themselves stay in the
// binary chunk, but each accessor records the min and max corner of what it
// holds, which is the bounding box already computed for us.

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a GLB: ${path}`);
  let at = 12;
  while (at < buf.length) {
    const len = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    if (type === CHUNK_JSON) return JSON.parse(buf.subarray(at + 8, at + 8 + len).toString("utf8"));
    at += 12 + len;
  }
  throw new Error(`no JSON chunk: ${path}`);
}

// ── Just enough matrix maths to walk a glTF node tree ─────────────────
// glTF stores matrices column-major, and a node carries either a full matrix
// or a translation/rotation/scale triple. Both have to be handled: Kenney's
// furniture uses TRS, the building kits use neither.

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** Build a matrix from a node's translation / rotation quaternion / scale. */
function compose(t, q, s) {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  if (!node.translation && !node.rotation && !node.scale) return IDENTITY;
  return compose(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
}

function applyPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/**
 * The model's bounding box in glTF units, walking the whole node tree.
 *
 * Each mesh contributes the eight corners of its own box put through the
 * transforms of every node above it. Transforming corners rather than the box
 * itself is what keeps a rotated node honest.
 *
 * `scale` is the kit's correction factor; the result is in feet.
 */
function measure(gltf, scale) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const nodes = gltf.nodes || [];

  const visit = (index, parent) => {
    const node = nodes[index];
    if (!node) return;
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives || []) {
        const acc = gltf.accessors[prim.attributes.POSITION];
        if (!acc || !acc.min || !acc.max) continue;
        for (let corner = 0; corner < 8; corner++) {
          const p = applyPoint(world, [
            corner & 1 ? acc.max[0] : acc.min[0],
            corner & 2 ? acc.max[1] : acc.min[1],
            corner & 4 ? acc.max[2] : acc.min[2],
          ]);
          for (let i = 0; i < 3; i++) {
            if (p[i] < lo[i]) lo[i] = p[i];
            if (p[i] > hi[i]) hi[i] = p[i];
          }
        }
      }
    }
    for (const child of node.children || []) visit(child, world);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes || nodes.map((_, i) => i)) visit(root, IDENTITY);

  // A model with no geometry at all would leave the box at infinity; fall back
  // to a one-foot cube rather than writing NaN into the manifest.
  if (!Number.isFinite(lo[0])) return { w: 1, d: 1, h: 1 };
  const ft = (a, b) => Math.max(0.1, Math.round((b - a) * FT_PER_M * scale * 100) / 100);
  return { w: ft(lo[0], hi[0]), h: ft(lo[1], hi[1]), d: ft(lo[2], hi[2]) };
}

// ── Naming ───────────────────────────────────────────────────────────

/**
 * "bathroomCabinetDrawer" -> ["bathroom", "Cabinet", "Drawer"]
 *
 * Kenney uses three conventions across the four kits — camelCase in furniture,
 * kebab-case in the building kits, snake_case in nature — so all three are
 * split the same way and the first word becomes the group.
 */
function words(file) {
  return file
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Import ───────────────────────────────────────────────────────────

function copyDir(from, to, filter) {
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const file of readdirSync(from)) {
    if (!filter(file)) continue;
    copyFileSync(join(from, file), join(to, file));
    n++;
  }
  return n;
}

function main() {
  if (!existsSync(SRC)) throw new Error(`no kits at ${SRC}`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const kits = [];
  const items = [];
  const missingThumbs = [];

  for (const kit of KITS) {
    const root = join(SRC, kit.dir);
    const modelDir = join(root, kit.models);
    const thumbDir = join(root, kit.thumbs);
    const files = readdirSync(modelDir).filter((f) => f.endsWith(".glb")).sort();

    // The two textured kits point at "Textures/colormap.png" beside the models
    // rather than embedding it, so that folder has to travel with them.
    const textures = join(modelDir, "Textures");
    if (existsSync(textures)) copyDir(textures, join(OUT, kit.id, "models", "Textures"), (f) => f.endsWith(".png"));

    mkdirSync(join(OUT, kit.id, "models"), { recursive: true });
    mkdirSync(join(OUT, kit.id, "thumbs"), { recursive: true });

    const counts = new Map();
    const rows = [];

    for (const file of files) {
      const stem = basename(file, ".glb");
      const id = `${kit.id}/${stem}`;
      if (id.length > MAX_ID) throw new Error(`id too long for the API (${id.length} > ${MAX_ID}): ${id}`);
      const size = measure(readGlbJson(join(modelDir, file)), kit.scale);
      const parts = words(stem);
      const group = titleCase(parts[0] || "misc");

      copyFileSync(join(modelDir, file), join(OUT, kit.id, "models", file));

      // The Library hides a picture that fails to load, so a model without one
      // still gets a named, clickable tile. It is reported at the end all the
      // same — a whole kit arriving without previews means the wrong folder.
      const thumbSrc = join(thumbDir, stem + kit.thumbSuffix + ".png");
      if (existsSync(thumbSrc)) copyFileSync(thumbSrc, join(OUT, kit.id, "thumbs", stem + ".png"));
      else missingThumbs.push(id);

      counts.set(group, (counts.get(group) || 0) + 1);
      const mount = mountOf(id);
      rows.push({
        id, n: parts.map(titleCase).join(" "), g: group,
        t: classify(TYPE_RULES, id),      // what it is
        r: classify(ROOM_RULES, id),      // where it goes
        w: size.w, d: size.d, h: size.h,
        ...(mount === undefined ? {} : { m: mount }),
      });
    }

    // Fold the one- and two-item groups together, or the Library turns into a
    // list of headings with a single tile under each.
    for (const row of rows) if ((counts.get(row.g) || 0) < MIN_GROUP) row.g = "Misc";

    kits.push({ id: kit.id, name: kit.name, blurb: kit.blurb, count: rows.length });
    items.push(...rows);
    console.log(`${kit.name.padEnd(10)} ${String(rows.length).padStart(3)} models`);
  }

  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify({ unit: "ft", kits, items }, null, 0) + "\n"
  );

  // Kenney releases every kit under CC0, which asks for nothing — the notice
  // travels with the files anyway so nobody has to go and look it up.
  writeFileSync(
    join(OUT, "LICENSE.txt"),
    [
      "Kenney model kits — Building, Furniture, Nature and Prototype.",
      "",
      "Created by Kenney (kenney.nl) and released under Creative Commons CC0 1.0:",
      "https://creativecommons.org/publicdomain/zero/1.0/",
      "",
      "CC0 waives all copyright, so these models may be used, changed and",
      "redistributed for any purpose without permission or attribution. Buildora",
      "credits Kenney in the Design Studio's Library anyway.",
      "",
      "The originals are kept in Essentials/Kits; this folder is generated from",
      "them by apps/web/scripts/import-kits.mjs.",
      "",
    ].join("\n")
  );

  console.log(`\n${items.length} models -> public/kits`);
  if (missingThumbs.length) console.log(`no preview for: ${missingThumbs.join(", ")}`);
}

main();
