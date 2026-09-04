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
  "rounded-3xl border border-black/[0.06] bg-white/70 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_24px_48px_-32px_rgba(28,25,23,0.28)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_24px_48px_-32px_rgba(0,0,0,0.8)]";

/**
 * Title strip at the top of a surface, divided from the body by a hairline.
 * The divider is what makes a card read as "header + content" rather than one
 * undifferentiated box.
 */
export const surfaceHeaderClass =
  "flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-4 py-3.5 sm:px-5 dark:border-white/10";

/** Standard body padding inside a surface. */
export const surfaceBodyClass = "p-4 sm:p-5";

/**
 * Interactive surface — a card that is itself a link or button.
 *
 * Three things beyond the hover lift:
 *
 * The properties are named rather than left as a bare `transition`, which in
 * Tailwind v4 watches a list of about fifteen. A card carries a backdrop blur
 * and a shadow, and putting those on the watch list means the compositor
 * re-evaluates them on a hover that was only ever going to move the card 2px.
 *
 * `active:scale-[0.99]` is the press. The global rule in `globals.css` gives
 * every `<button>` one automatically, but these cards are usually an `<a>`,
 * and a link is not pressable by default — so it is declared here instead.
 * 0.99 rather than the 0.97 a button gets: the same *visual* amount of squeeze
 * needs a smaller ratio on a large surface, and a card is a large surface.
 *
 * The lift is undone on press. Lifting toward the reader on hover and then
 * pushing back down on click is the whole gesture — without the second half
 * the card just floats and never lands.
 */
export const surfaceHoverClass =
  "spotlight transition-[translate,scale,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-amber-400/60 hover:shadow-2xl hover:shadow-amber-900/10 active:translate-y-0 active:scale-[0.99] dark:hover:shadow-black/40";
