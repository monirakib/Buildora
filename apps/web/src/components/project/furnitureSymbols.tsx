import { FurnitureKind } from "@buildora/shared";

/**
 * The furniture symbols drawn on the 2D floor plan.
 *
 * Every symbol is plain SVG drawn in **feet**, in its own local box running
 * from (0,0) at the top-left to (w,h) at the bottom-right. The caller decides
 * where that box sits and which way it faces with a single
 * `translate(...) rotate(...)` transform, so nothing in this file has to know
 * about the sheet, the zoom level, or the item's rotation.
 *
 * Sizes are written as fractions of w and h rather than fixed numbers, so a
 * 5 ft wardrobe and a 7 ft one both look right. Everything is viewed from
 * above, the way a plan is: a bed is a mattress with pillows at its head, a
 * toilet is a tank and a bowl, a sofa is a back with seat cushions.
 */

/**
 * Line weights, in feet, so they stay proportional to the drawing as you zoom.
 * `OUTLINE` matches the room outline weight in PlanCanvas; `DETAIL` is the
 * lighter weight used for cushion seams, door panels and taps.
 */
const OUTLINE = 0.09;
const DETAIL = 0.05;

/** Fill for the body of a piece — a warm neutral that reads on either theme. */
const BODY = "var(--plan-furniture-fill)";
/** Fill for porcelain: toilets, basins, tubs. Cooler and lighter than BODY. */
const PORCELAIN = "var(--plan-furniture-pale)";
/** Fill for dark surfaces: TV screens, monitors. */
const SCREEN = "var(--plan-furniture-dark)";

export function FurnitureSymbol({
  kind,
  widthFt: w,
  depthFt: h,
  stroke,
}: {
  kind: FurnitureKind;
  widthFt: number;
  depthFt: number;
  /** Outline colour — the caller swaps this when the piece is selected. */
  stroke: string;
}) {
  // Shared by nearly every symbol: the outer body, and a lighter inner detail.
  const body = { fill: BODY, stroke, strokeWidth: OUTLINE };
  const detail = { fill: "none", stroke, strokeWidth: DETAIL };

  switch (kind) {
    case FurnitureKind.BED_DOUBLE:
    case FurnitureKind.BED_SINGLE: {
      // Headboard across the top, mattress below it, pillows at the head, and
      // a turned-down blanket line about a third of the way down.
      const pillowW = kind === FurnitureKind.BED_DOUBLE ? w * 0.42 : w * 0.7;
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={0.2} {...body} />
          <rect x={0} y={0} width={w} height={h * 0.1} rx={0.1} fill={stroke} opacity={0.35} />
          <rect
            x={w * 0.04}
            y={h * 0.13}
            width={pillowW}
            height={h * 0.14}
            rx={0.15}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={DETAIL}
          />
          {kind === FurnitureKind.BED_DOUBLE && (
            <rect
              x={w - w * 0.04 - pillowW}
              y={h * 0.13}
              width={pillowW}
              height={h * 0.14}
              rx={0.15}
              fill={PORCELAIN}
              stroke={stroke}
              strokeWidth={DETAIL}
            />
          )}
          <line x1={0} y1={h * 0.38} x2={w} y2={h * 0.38} {...detail} />
        </>
      );
    }

    case FurnitureKind.SOFA: {
      // Back along the top, arms down each side, and one seam per seat. Seats
      // are counted off the width so a 7 ft sofa reads as a 3-seater.
      const arm = Math.min(w * 0.1, 0.6);
      const seats = Math.max(2, Math.round(w / 2.2));
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={0.25} {...body} />
          <rect x={0} y={0} width={w} height={h * 0.28} rx={0.2} {...body} />
          <rect x={0} y={0} width={arm} height={h} rx={0.2} {...body} />
          <rect x={w - arm} y={0} width={arm} height={h} rx={0.2} {...body} />
          {Array.from({ length: seats - 1 }, (_, i) => {
            const x = arm + ((w - arm * 2) / seats) * (i + 1);
            return <line key={i} x1={x} y1={h * 0.28} x2={x} y2={h} {...detail} />;
          })}
        </>
      );
    }

    case FurnitureKind.DINING_TABLE: {
      // Table top inset from the box, with chairs filling the gap on all four
      // sides. How many fit is worked out from the length of each side.
      const gap = Math.min(w, h) * 0.18;
      const chair = 1.2;
      const cols = Math.max(1, Math.floor((w - gap * 2) / (chair + 0.3)));
      const rows = Math.max(1, Math.floor((h - gap * 2) / (chair + 0.3)));
      return (
        <>
          <rect x={gap} y={gap} width={w - gap * 2} height={h - gap * 2} rx={0.2} {...body} />
          {Array.from({ length: cols }, (_, i) => {
            const cx = gap + ((w - gap * 2) / cols) * (i + 0.5);
            return (
              <g key={`c${i}`}>
                <rect
                  x={cx - chair / 2}
                  y={0}
                  width={chair}
                  height={gap * 0.8}
                  rx={0.12}
                  {...body}
                />
                <rect
                  x={cx - chair / 2}
                  y={h - gap * 0.8}
                  width={chair}
                  height={gap * 0.8}
                  rx={0.12}
                  {...body}
                />
              </g>
            );
          })}
          {Array.from({ length: rows }, (_, i) => {
            const cy = gap + ((h - gap * 2) / rows) * (i + 0.5);
            return (
              <g key={`r${i}`}>
                <rect
                  x={0}
                  y={cy - chair / 2}
                  width={gap * 0.8}
                  height={chair}
                  rx={0.12}
                  {...body}
                />
                <rect
                  x={w - gap * 0.8}
                  y={cy - chair / 2}
                  width={gap * 0.8}
                  height={chair}
                  rx={0.12}
                  {...body}
                />
              </g>
            );
          })}
        </>
      );
    }

    case FurnitureKind.WARDROBE: {
      // A box divided into doors, each with a handle, plus the hanging rail
      // line that tells it apart from a plain cabinet on the drawing.
      const doors = Math.max(1, Math.round(w / 2.5));
      return (
        <>
          <rect x={0} y={0} width={w} height={h} {...body} />
          <line x1={0} y1={h * 0.28} x2={w} y2={h * 0.28} {...detail} />
          {Array.from({ length: doors }, (_, i) => {
            const dw = w / doors;
            return (
              <g key={i}>
                {i > 0 && <line x1={dw * i} y1={0} x2={dw * i} y2={h} {...detail} />}
                <circle cx={dw * (i + 0.5)} cy={h * 0.72} r={0.09} fill={stroke} />
              </g>
            );
          })}
        </>
      );
    }

    case FurnitureKind.TV_UNIT:
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={0.1} {...body} />
          <rect
            x={w * 0.12}
            y={h * 0.15}
            width={w * 0.76}
            height={h * 0.4}
            rx={0.08}
            fill={SCREEN}
            stroke={stroke}
            strokeWidth={DETAIL}
          />
          <line x1={w * 0.5} y1={h * 0.62} x2={w * 0.5} y2={h} {...detail} />
        </>
      );

    case FurnitureKind.TOILET:
      // Cistern across the back, bowl in front of it.
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h * 0.28}
            rx={0.08}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={OUTLINE}
          />
          <ellipse
            cx={w / 2}
            cy={h * 0.63}
            rx={w * 0.44}
            ry={h * 0.33}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={OUTLINE}
          />
          <ellipse cx={w / 2} cy={h * 0.65} rx={w * 0.28} ry={h * 0.21} {...detail} />
        </>
      );

    case FurnitureKind.SINK:
      // Counter, basin, drain, and a tap sticking out of the back edge.
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={0.12}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={OUTLINE}
          />
          <ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.33} ry={h * 0.3} {...detail} />
          <circle cx={w / 2} cy={h * 0.55} r={0.08} fill={stroke} />
          <line x1={w / 2} y1={h * 0.1} x2={w / 2} y2={h * 0.24} {...detail} />
          <line x1={w * 0.36} y1={h * 0.12} x2={w * 0.64} y2={h * 0.12} {...detail} />
        </>
      );

    case FurnitureKind.SHOWER:
      // Tray with the two diagonals that mark a shower on a plan, plus the
      // head on the back wall.
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={OUTLINE}
          />
          <line x1={0} y1={0} x2={w} y2={h} {...detail} />
          <line x1={w} y1={0} x2={0} y2={h} {...detail} />
          <circle cx={w / 2} cy={h / 2} r={0.14} fill={stroke} />
          <rect
            x={w * 0.62}
            y={h * 0.06}
            width={w * 0.28}
            height={h * 0.12}
            rx={0.06}
            fill={BODY}
            stroke={stroke}
            strokeWidth={DETAIL}
          />
        </>
      );

    case FurnitureKind.BATHTUB:
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={0.35}
            fill={PORCELAIN}
            stroke={stroke}
            strokeWidth={OUTLINE}
          />
          <rect x={w * 0.12} y={h * 0.14} width={w * 0.76} height={h * 0.76} rx={0.3} {...detail} />
          <circle cx={w / 2} cy={h * 0.78} r={0.12} fill={stroke} />
          <circle cx={w / 2} cy={h * 0.08} r={0.14} {...detail} />
        </>
      );

    case FurnitureKind.DESK:
      // Desktop with a monitor on it, seen from above.
      return (
        <>
          <rect x={0} y={0} width={w} height={h} {...body} />
          <rect
            x={w * 0.32}
            y={h * 0.12}
            width={w * 0.36}
            height={h * 0.18}
            rx={0.06}
            fill={SCREEN}
            stroke={stroke}
            strokeWidth={DETAIL}
          />
          <line x1={w / 2} y1={h * 0.3} x2={w / 2} y2={h * 0.42} {...detail} />
        </>
      );

    case FurnitureKind.CHAIR:
      // Backrest across the top, seat below.
      return (
        <>
          <rect x={0} y={h * 0.22} width={w} height={h * 0.78} rx={0.15} {...body} />
          <rect x={0} y={0} width={w} height={h * 0.2} rx={0.1} {...body} />
        </>
      );
  }
}
