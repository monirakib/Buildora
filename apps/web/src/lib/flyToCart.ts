"use client";

import { gsap, prefersReducedMotion } from "@/lib/gsap";

/** The navbar cart button marks itself with this id so the flight has a target. */
export const CART_BUTTON_ID = "cart-button";

/**
 * Throws a small copy of the product at the cart button.
 *
 * The one piece of motion in the add-to-cart flow that is not feedback on the
 * button itself: it answers "where did it go?" by drawing the line from the
 * product to the cart, which is what makes the badge count that follows read
 * as *this* item arriving rather than a number changing on its own.
 *
 * Transform and opacity only. The clone is a fixed-position element created
 * for the flight and removed the moment it lands, so nothing in the page
 * layout is touched. Resolves when the clone has landed, so the caller can
 * bump the badge at exactly that moment.
 */
export function flyToCart(from: HTMLElement, imageUrl?: string): Promise<void> {
  return new Promise((resolve) => {
    const target = document.getElementById(CART_BUTTON_ID);
    if (!target || prefersReducedMotion()) {
      resolve();
      return;
    }

    const start = from.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    const size = 44;

    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
      position: "fixed",
      left: `${start.left + start.width / 2 - size / 2}px`,
      top: `${start.top + start.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "9999px",
      zIndex: "80",
      pointerEvents: "none",
      boxShadow: "0 10px 30px -8px rgba(217, 119, 6, 0.6)",
      border: "2px solid #fbbf24",
      background: imageUrl ? `#fbbf24 url("${imageUrl}") center/cover no-repeat` : "#fbbf24",
      willChange: "transform, opacity",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);

    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);

    // A short arc rather than a straight line: the clone lifts a little first,
    // then drops into the cart. Two tweens on one timeline, x linear-ish and y
    // eased, is enough to sell the throw without a physics library.
    const tl = gsap.timeline({
      onComplete: () => {
        el.remove();
        resolve();
      },
    });
    tl.to(el, { x: dx, duration: 0.65, ease: "power2.inOut" }, 0)
      .to(el, { y: -40, duration: 0.22, ease: "power2.out" }, 0)
      .to(el, { y: dy, duration: 0.43, ease: "power2.in" }, 0.22)
      .to(el, { scale: 0.25, opacity: 0.4, duration: 0.3, ease: "power2.in" }, 0.35);
  });
}
