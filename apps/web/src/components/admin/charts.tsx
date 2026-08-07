"use client";

import { useEffect, useRef, useState } from "react";
import type { DayPoint } from "@buildora/shared";
import { bdtFull, compact, mediumDate, shortDate } from "./format";

/**
 * Hand-rolled SVG charts for the admin console, following a fixed spec:
 * 2px lines, ≤24px bars with a 4px rounded data-end (square at the baseline),
 * ~10% area washes, hairline solid gridlines, markers with a surface-colored
 * ring, and text always in ink colors — never the series color. The series
 * hue is blue (#2a78d6 light / #3987e5 dark), validated for both surfaces.
 */

// Fixed height; width follows the container (measured below) so axis text
// renders at its real pixel size on every screen instead of scaling down.
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const IH = H - PAD.top - PAD.bottom;

/** Tracks the rendered width of the chart's container. */
function useChartWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { containerRef, width };
}

/** Smallest "clean" ceiling ≥ max, so y-ticks land on round numbers. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 4, 5, 10]) {
    if (m * pow >= max) return m * pow;
  }
  return 10 * pow;
}

/** Shared y-axis: 3 gridlines (0, half, max) with tick labels. */
function YAxis({ max, money, w }: { max: number; money?: boolean; w: number }) {
  const fmt = (v: number) => (money ? `৳${compact(v)}` : compact(v));
  return (
    <>
      {[0, 0.5, 1].map((t) => {
        const y = PAD.top + IH - t * IH;
        return (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y}
              y2={y}
              className="stroke-[#e1e0d9] dark:stroke-[#2c2c2a]"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 8}
              y={y + 3.5}
              textAnchor="end"
              className="fill-[#898781] text-[11px]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmt(t * max)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** ~5 date labels along the x-axis. */
function XAxis({ data, band }: { data: DayPoint[]; band: (i: number) => number }) {
  const n = data.length;
  const ticks = n <= 7 ? data.map((_, i) => i) : [0, 7, 14, 21, n - 1].filter((i) => i < n);
  return (
    <>
      {ticks.map((i) => {
        const point = data[i];
        if (!point) return null;
        return (
          <text
            key={i}
            x={band(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-[#898781] text-[11px]"
          >
            {shortDate(point.date)}
          </text>
        );
      })}
    </>
  );
}

/** Tooltip bubble, positioned by SVG-fraction coordinates. */
function Tip({ xFrac, title, lines }: { xFrac: number; title: string; lines: string[] }) {
  // Flip sides at the midpoint so the bubble never leaves the card.
  const style: React.CSSProperties =
    xFrac < 0.5
      ? { left: `${xFrac * 100}%`, marginLeft: 12 }
      : { right: `${(1 - xFrac) * 100}%`, marginRight: 12 };
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 w-max max-w-48 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-lg shadow-black/10 dark:border-white/10 dark:bg-stone-800"
      style={style}
    >
      <p className="text-xs font-bold">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-xs text-stone-500 dark:text-stone-400">
          {l}
        </p>
      ))}
    </div>
  );
}

function useNearestIndex(n: number, iw: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [index, setIndex] = useState<number | null>(null);

  function onMove(e: React.MouseEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // Mouse px → nearest data index (SVG units are pixels now).
    const frac = (e.clientX - box.left - PAD.left) / iw;
    setIndex(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  }
  return { ref, index, onMove, clear: () => setIndex(null) };
}

/**
 * Daily line chart with an area wash and a crosshair tooltip. Single series —
 * the card title names it, so there is no legend; the endpoint carries a
 * direct label and every point is reachable by hover.
 */
export function TrendChart({ data, money = false }: { data: DayPoint[]; money?: boolean }) {
  const { containerRef, width: W } = useChartWidth();
  const IW = W - PAD.left - PAD.right;
  const n = data.length;
  const values = data.map((d) => (money ? (d.totalBdt ?? 0) : d.count));
  const max = niceMax(Math.max(...values));
  const x = (i: number) => PAD.left + (i / (n - 1)) * IW;
  const y = (v: number) => PAD.top + IH - (v / max) * IH;

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("");
  const areaPath = `${linePath}L${x(n - 1)},${PAD.top + IH}L${x(0)},${PAD.top + IH}Z`;
  const empty = values.every((v) => v === 0);
  const last = values[n - 1] ?? 0;

  const { ref, index, onMove, clear } = useNearestIndex(n, IW);
  // Everything the crosshair needs about the hovered day, or null.
  const hover =
    index !== null && data[index]
      ? { i: index, point: data[index], value: values[index] ?? 0 }
      : null;
  const fmt = (v: number) => (money ? bdtFull(v) : String(v));

  return (
    // The svg is absolutely positioned so its width never props open the
    // container — otherwise the first (default-width) render would jam the
    // measurement and the chart could never shrink on small screens.
    <div ref={containerRef} className="relative w-full" style={{ height: H }}>
      <svg
        ref={ref}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0"
        onMouseMove={onMove}
        onMouseLeave={clear}
        role="img"
      >
        <YAxis max={max} money={money} w={W} />
        <XAxis data={data} band={x} />

        {!empty && (
          <>
            {/* Area wash at ~10%, then the 2px line above it */}
            <path d={areaPath} className="fill-[#2a78d6]/10 dark:fill-[#3987e5]/10" />
            <path
              d={linePath}
              fill="none"
              className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* End marker (surface ring) + direct label for the latest value */}
            <circle
              cx={x(n - 1)}
              cy={y(last)}
              r="4.5"
              className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-stone-900"
              strokeWidth="2"
            />
            <text
              x={x(n - 1) - 8}
              y={y(last) - 9}
              textAnchor="end"
              className="fill-stone-700 text-[11.5px] font-bold dark:fill-stone-200"
            >
              {money ? `৳${compact(last)}` : last}
            </text>
          </>
        )}

        {/* Crosshair for the hovered day */}
        {hover && !empty && (
          <>
            <line
              x1={x(hover.i)}
              x2={x(hover.i)}
              y1={PAD.top}
              y2={PAD.top + IH}
              className="stroke-stone-300 dark:stroke-stone-600"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover.i)}
              cy={y(hover.value)}
              r="4.5"
              className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-stone-900"
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {empty && (
        <p className="absolute inset-0 grid place-items-center text-sm text-stone-400 dark:text-stone-500">
          No data in this period yet
        </p>
      )}
      {hover && !empty && (
        <Tip
          xFrac={x(hover.i) / W}
          title={mediumDate(hover.point.date)}
          lines={[fmt(hover.value)]}
        />
      )}
    </div>
  );
}

/**
 * Daily column chart. Columns are ≤14px wide with a 4px rounded cap and a
 * square baseline; hover highlights the day and shows count + value.
 */
export function ColumnChart({ data }: { data: DayPoint[] }) {
  const { containerRef, width: W } = useChartWidth();
  const IW = W - PAD.left - PAD.right;
  const n = data.length;
  const values = data.map((d) => d.count);
  const max = niceMax(Math.max(...values));
  const slot = IW / n;
  const barW = Math.min(14, slot * 0.62);
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const empty = values.every((v) => v === 0);

  const { ref, index, onMove, clear } = useNearestIndex(n, IW);
  const hover = index !== null && data[index] ? { i: index, point: data[index] } : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: H }}>
      <svg
        ref={ref}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0"
        onMouseMove={onMove}
        onMouseLeave={clear}
        role="img"
      >
        <YAxis max={max} w={W} />
        <XAxis data={data} band={x} />

        {values.map((v, i) => {
          if (v === 0) return null;
          const h = (v / max) * IH;
          const top = PAD.top + IH - h;
          const r = Math.min(4, h); // rounded data-end, square baseline
          const left = x(i) - barW / 2;
          return (
            <path
              key={data[i]?.date ?? i}
              d={`M${left},${PAD.top + IH} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${PAD.top + IH} Z`}
              className={
                index === i
                  ? "fill-[#1c5cab] dark:fill-[#6da7ec]"
                  : "fill-[#2a78d6] dark:fill-[#3987e5]"
              }
            />
          );
        })}
      </svg>

      {empty && (
        <p className="absolute inset-0 grid place-items-center text-sm text-stone-400 dark:text-stone-500">
          No data in this period yet
        </p>
      )}
      {hover && !empty && (
        <Tip
          xFrac={x(hover.i) / W}
          title={mediumDate(hover.point.date)}
          lines={[
            `${hover.point.count} ${hover.point.count === 1 ? "order" : "orders"}`,
            ...(hover.point.totalBdt != null ? [bdtFull(hover.point.totalBdt)] : []),
          ]}
        />
      )}
    </div>
  );
}

/**
 * Horizontal magnitude bars: one hue, ≤16px thick, rounded data-end, value
 * directly labeled at every tip (few rows, so labeling all is fine).
 */
export function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs font-semibold text-stone-600 sm:w-36 dark:text-stone-300">
            {row.label}
          </span>
          <div className="relative h-4 flex-1">
            <div
              className="h-4 rounded-r-sm bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%` }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 pl-2 text-xs font-bold text-stone-700 dark:text-stone-200"
              style={{
                left: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {compact(row.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 12-point sparkline for stat tiles — de-emphasis gray, endpoint in blue. */
export function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 32;
  const max = Math.max(1, ...points);
  const n = points.length;
  const x = (i: number) => 2 + (i / (n - 1)) * (w - 8);
  const y = (v: number) => 2 + (h - 8) * (1 - v / max) + 2;
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-24" aria-hidden>
      <path
        d={path}
        fill="none"
        className="stroke-stone-300 dark:stroke-stone-600"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(n - 1)}
        cy={y(points[n - 1] ?? 0)}
        r="3.5"
        className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-stone-900"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * KPI stat tile: label · big value · optional signed delta vs the previous
 * period · optional sparkline of the last 12 days.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  sub,
  spark,
}: {
  label: string;
  value: string;
  /** Absolute change vs the compared period; sign picks the color. */
  delta?: number;
  deltaLabel?: string;
  sub?: string;
  spark?: number[];
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-stone-400">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-extrabold tracking-tight">{value}</p>
        {spark && <Sparkline points={spark} />}
      </div>
      {(delta !== undefined || sub) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          {delta !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 font-bold ${
                delta >= 0
                  ? "text-[#006300] dark:text-[#0ca30c]"
                  : "text-[#d03b3b] dark:text-[#e66767]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3 w-3 ${delta < 0 ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              {delta >= 0 ? "+" : ""}
              {compact(delta)}
            </span>
          )}
          {deltaLabel && <span>{deltaLabel}</span>}
          {sub && <span>{sub}</span>}
        </p>
      )}
    </div>
  );
}
