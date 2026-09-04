/**
 * The backdrop every page sits on.
 *
 * Three stacked layers, all painted with CSS — no images, no canvas, no JS:
 *
 *   1. three big colour washes that drift slowly past each other,
 *   2. film grain, so the glass panels have something to frost,
 *   3. a vignette that darkens the rim and pushes content forward.
 *
 * The colours come from the `--ambient-*` custom properties in globals.css,
 * which the `.dark` class re-points — so this markup renders once and works in
 * both themes. It's a server component (no hooks, no theme read), which also
 * means there's nothing here that could mismatch during hydration.
 *
 * `fixed inset-0 -z-10` parks it behind the page content but above the body
 * background, and `pointer-events-none` keeps it out of the way of clicks.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* ---- 1. Colour washes ----
          Plain radial gradients rather than blurred circles: a gradient is
          already soft, and skipping `filter: blur()` on elements this large
          keeps scrolling cheap on low-end machines. */}
      <div
        className="animate-drift-a absolute -top-[20rem] -left-[16rem] h-[46rem] w-[46rem]"
        style={{ background: "radial-gradient(closest-side, var(--ambient-a), transparent)" }}
      />
      <div
        className="animate-drift-b absolute -top-[14rem] -right-[18rem] h-[44rem] w-[44rem]"
        style={{ background: "radial-gradient(closest-side, var(--ambient-b), transparent)" }}
      />
      <div
        className="animate-drift-c absolute -bottom-[22rem] left-1/4 h-[42rem] w-[42rem]"
        style={{ background: "radial-gradient(closest-side, var(--ambient-c), transparent)" }}
      />

      {/* ---- 2. Film grain ----
          An inline SVG turbulence filter, tiled. Same trick the verification
          wizard uses, so the two backdrops share a texture. */}
      <div
        className="absolute inset-0"
        style={{
          // The fallback matters more than it looks: if --ambient-grain ever
          // goes missing, `opacity: var(--ambient-grain)` is invalid and the
          // property resets to its initial value of 1 — full-strength noise
          // over the whole page. Naming the default here means a missing
          // variable degrades to "correct" instead of to television static.
          opacity: "var(--ambient-grain, 0.03)",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ---- 3. Vignette ---- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 80% at 50% 0%, transparent 45%, var(--ambient-vignette) 100%)",
        }}
      />
    </div>
  );
}
