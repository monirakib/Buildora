/**
 * The card surface, for the whole app.
 *
 * Every page used to declare its own `cardClass` string, and they had drifted
 * into three different looks — a heavy "liquid glass" panel with a gradient
 * sheen on the form pages, a lighter card on the list pages, and a third on the
 * account console. Same idea, three finishes, depending on which page you
 * happened to be standing on.
 *
 * This is the one that won: flatter, quieter, and legible in both themes.
 * Light mode gets a background fill and dark mode leans on the outline — the
 * fill that reads as "raised" on warm stone reads as muddy on slate, where a
 * border separates more cleanly.
 *
 * Deliberately carries **no padding**. Cards differ in how they pad — a list
 * that runs edge to edge pads nothing, a form pads its body but not its header
 * — so the caller adds `surfaceBodyClass` or its own spacing. Keeping padding
 * out is what lets one string cover every case.
 */
export const surfaceClass =
  "rounded-2xl border border-white/50 bg-white/55 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-black/20";

/**
 * Title strip at the top of a surface, divided from the body by a hairline.
 * The divider is what makes a card read as "header + content" rather than one
 * undifferentiated box.
 */
export const surfaceHeaderClass =
  "flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-4 py-3.5 sm:px-5 dark:border-white/10";

/** Standard body padding inside a surface. */
export const surfaceBodyClass = "p-4 sm:p-5";

/** Interactive surface — a card that is itself a link or button. */
export const surfaceHoverClass = "transition hover:-translate-y-0.5 hover:border-amber-400/60";
