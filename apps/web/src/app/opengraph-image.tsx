import { ImageResponse } from "next/og";
import { APP_NAME } from "@buildora/shared";

/**
 * The link preview every Buildora URL falls back to.
 *
 * Rendered with `next/og`, which ships with Next — no image library and no
 * checked-in binary, so the card stays in step with the brand the same way the
 * icons do (see scripts/generate-icons.mjs). Next builds this once and serves
 * the PNG statically.
 *
 * Satori, the renderer underneath, only understands flexbox and inline styles:
 * no grid, no class names, and every element with more than one child needs an
 * explicit `display: flex`.
 */
export const alt = `${APP_NAME} — the construction super-platform for Bangladesh`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#060a15";
const AMBER = "#fbbf24";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        padding: 72,
        /* Satori has no radial-gradient, so the warm glow behind the mark is
             a linear one angled across the card. */
        backgroundImage: `linear-gradient(135deg, ${INK} 45%, #12203a 100%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <svg width="88" height="88" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 20V8.5L12 3l8 5.5V20"
            stroke={AMBER}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "white" }}>
          {APP_NAME}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 62,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.15,
            letterSpacing: -1.5,
            maxWidth: 900,
          }}
        >
          Every professional verified. Every payment protected. Every permit tracked.
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#94a3b8", maxWidth: 880 }}>
          Land owners, architects, engineers, contractors and suppliers — one platform, plot to
          keys.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{ display: "flex", width: 56, height: 6, background: AMBER, borderRadius: 3 }}
        />
        <div style={{ display: "flex", fontSize: 26, color: AMBER, fontWeight: 700 }}>
          Bangladesh
        </div>
      </div>
    </div>,
    size
  );
}
