/**
 * Generates the Buildora icon set from the navbar's own logo path.
 *
 * Why a script and not a checked-in design file: the mark is five straight
 * lines, so rasterising it exactly is cheaper than keeping a binary in sync
 * with the SVG the navbar draws. Re-run this after any change to that path and
 * every icon updates together.
 *
 *   node apps/web/scripts/generate-icons.mjs
 *
 * No image library — PNG is a handful of length-prefixed, CRC'd chunks around a
 * zlib stream, which `node:zlib` already provides.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The navbar mark, as points in its own 24x24 viewBox. */
const MARK = [
  [4, 20],
  [4, 8.5],
  [12, 3],
  [20, 8.5],
  [20, 20],
];
/** Matches the navbar's strokeWidth of 2.4 in the same 24-unit space. */
const STROKE = 2.4;

const AMBER = [251, 191, 36]; // #fbbf24 — the brand accent
const INK = [10, 15, 26]; // near-black, the dark canvas from layout.tsx

// ---------------------------------------------------------------- geometry

/** Distance from a point to a line segment. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Distance to the whole polyline. Taking the minimum over segments is exactly
 * what gives round caps and round joins for free — a round-stroked polyline IS
 * the set of points within half the stroke width of it.
 */
function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance to a rounded rectangle; negative inside. */
function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** A signed distance in pixels to a 0..1 coverage, anti-aliased over one pixel. */
const coverage = (sd) => Math.max(0, Math.min(1, 0.5 - sd));

// ---------------------------------------------------------------- rendering

/**
 * @param size      square edge in pixels
 * @param radiusPct corner radius as a fraction of size (0 = full-bleed square)
 * @param markPct   how much of the tile the 24-unit viewBox spans
 * @param bg        background colour, or null for a transparent tile
 * @param fg        stroke colour
 */
function render({ size, radiusPct, markPct, bg, fg }) {
  const px = Buffer.alloc(size * size * 4); // transparent by default
  const scale = (size * markPct) / 24;
  const offset = (size - 24 * scale) / 2;
  const half = (STROKE * scale) / 2;
  const cx = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = x + 0.5;
      const sy = y + 0.5;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (bg) {
        const cov = coverage(sdRoundRect(sx, sy, cx, cx, cx, cx, radiusPct * size));
        [r, g, b] = bg;
        a = cov;
      }

      // The mark, composited over whatever the background left behind.
      const d = distToPolyline((sx - offset) / scale, (sy - offset) / scale, MARK) * scale;
      const cov = coverage(d - half);
      if (cov > 0) {
        const outA = cov + a * (1 - cov);
        // Straight (un-premultiplied) alpha compositing, per channel.
        r = (fg[0] * cov + r * a * (1 - cov)) / outA;
        g = (fg[1] * cov + g * a * (1 - cov)) / outA;
        b = (fg[2] * cov + b * a * (1 - cov)) / outA;
        a = outA;
      }

      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

// ---------------------------------------------------------------- PNG output

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline carries a leading filter byte; 0 means "store as-is", which
  // costs nothing to compute and compresses fine on flat two-colour art.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- the set

const ICONS = [
  // Favicon and touch icon. Next serves these straight from the app directory.
  { file: "src/app/icon.png", size: 256, radiusPct: 0.22, markPct: 0.76, bg: INK, fg: AMBER },
  // iOS applies its own squircle mask, so this one is full-bleed square.
  { file: "src/app/apple-icon.png", size: 180, radiusPct: 0, markPct: 0.7, bg: INK, fg: AMBER },
  // Manifest icons, "any" purpose — rounded, transparent outside the tile.
  { file: "public/icon-192.png", size: 192, radiusPct: 0.22, markPct: 0.76, bg: INK, fg: AMBER },
  { file: "public/icon-512.png", size: 512, radiusPct: 0.22, markPct: 0.76, bg: INK, fg: AMBER },
  // Maskable: Android crops to an arbitrary shape, so the mark has to sit well
  // inside the 80% safe zone and the tile has to be a full square.
  {
    file: "public/icon-maskable-512.png",
    size: 512,
    radiusPct: 0,
    markPct: 0.54,
    bg: INK,
    fg: AMBER,
  },
  // Android notification badge: only the alpha channel is used, so this is the
  // bare glyph in white on transparent.
  {
    file: "public/badge-72.png",
    size: 72,
    radiusPct: 0,
    markPct: 0.86,
    bg: null,
    fg: [255, 255, 255],
  },
];

for (const spec of ICONS) {
  const out = join(WEB, spec.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(spec.size, render(spec)));
  console.log(`wrote ${spec.file} (${spec.size}x${spec.size})`);
}
