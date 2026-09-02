"use client";

/**
 * The keyboard-only "skip to content" link.
 *
 * Every page here opens with the same navbar — a logo, three mega-menus, a
 * theme toggle, a notification bell — so reaching the actual page content by
 * keyboard costs a dozen tab presses on every single navigation. This is the
 * standard fix: the first focusable thing on the page jumps past all of it.
 *
 * It moves focus with script rather than relying on `href="#main"` because the
 * forty-odd pages each render their own <main> and none of them carry an id.
 * Finding the element at click time keeps this working everywhere without
 * touching every page, and behaves identically for the people who use it —
 * a skip link is activated with Enter, which fires this handler.
 *
 * `tabIndex = -1` is the load-bearing line: a <main> is not focusable by
 * default, and focus() on a non-focusable element silently does nothing.
 */
export function SkipToContent() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        const main = document.querySelector("main");
        if (!main) return; // Let the browser try the href instead.
        e.preventDefault();
        main.setAttribute("tabindex", "-1");
        main.focus();
        main.scrollIntoView();
      }}
      /* Off-screen until focused — visible only to whoever is tabbing. */
      className="sr-only rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 shadow-lg focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2"
    >
      Skip to content
    </a>
  );
}
