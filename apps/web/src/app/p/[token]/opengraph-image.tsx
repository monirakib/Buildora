import { ImageResponse } from "next/og";
import { APP_NAME } from "@buildora/shared";
import { fetchSharedProgress } from "./share";

/**
 * The link-preview card for a shared project.
 *
 * Mirrors the page behind the link — the same five stages, the same weighted
 * construction percentage — so the preview and the page never tell different
 * stories. Nothing here is more than the page already shows: no address beyond
 * the locality, no money, no names.
 *
 * Rendered per request rather than at build time, since the token is only known
 * when someone unfurls the link. Satori's rules apply: flexbox only, inline
 * styles only, explicit `display: flex` on anything with several children.
 */
export const alt = "Project build progress on Buildora";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#060a15";
const AMBER = "#fbbf24";
const EMERALD = "#34d399";
const MUTED = "#94a3b8";

export default async function ShareOgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const progress = await fetchSharedProgress(token);

  const stages = progress
    ? [
        ["Design", progress.designApproved],
        ["Structural", progress.structuralApproved],
        ["RAJUK permit", progress.permitIssued],
        ["Construction", progress.constructionStarted],
        ["Handed over", progress.handedOver],
      ]
    : [];

  const subtitle = progress
    ? [
        progress.floors ? `${progress.floors}-storey` : null,
        progress.buildingType?.replace(/_/g, " ").toLowerCase(),
        progress.areaName,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        backgroundImage: `linear-gradient(135deg, ${INK} 45%, #12203a 100%)`,
        padding: 68,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 20V8.5L12 3l8 5.5V20"
            stroke={AMBER}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: MUTED }}>
          {APP_NAME} · Project progress
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.1,
            maxWidth: 1000,
          }}
        >
          {progress ? progress.title : "This link isn't available"}
        </div>
        {subtitle ? (
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>{subtitle}</div>
        ) : null}
      </div>

      {progress && progress.constructionStarted ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 24, color: MUTED, fontWeight: 600 }}>
              Construction
            </div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "white" }}>
              {progress.constructionPercent}%
            </div>
          </div>
          {/* The bar: a full-width track with an amber fill sized by percent. */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 16,
              borderRadius: 8,
              background: "rgba(255,255,255,0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${Math.max(progress.constructionPercent, 2)}%`,
                height: 16,
                borderRadius: 8,
                background: AMBER,
              }}
            />
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {stages.map(([label, done]) => (
          <div
            key={String(label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 20px",
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 600,
              background: done ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
              color: done ? EMERALD : MUTED,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 12,
                height: 12,
                borderRadius: 6,
                background: done ? EMERALD : "rgba(255,255,255,0.2)",
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>,
    size
  );
}
