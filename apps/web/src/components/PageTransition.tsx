"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * Fades each page in as you navigate between them.
 *
 * Wrapped around the whole app in the root layout. `usePathname()` changes on
 * every route change, and passing it as a GSAP dependency re-runs the tween —
 * so every page gets the same soft entrance instead of snapping in.
 *
 * Note this animates *opacity only*, never a transform: a transform on an
 * ancestor would become the containing block for `position: fixed` children
 * and break the fixed navbar and the cursor glow.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1 });
        return;
      }

      gsap.fromTo(
        el,
        { opacity: 0 },
        {
          opacity: 1,
          // Navigating is one of the most repeated actions in the app, and the
          // frequency is what sets the budget: at 450ms every page arrival had
          // a visible lag before the content settled, which reads as a slow
          // site rather than a considered one. 200ms still covers the swap —
          // long enough to stop the content snapping in, short enough that
          // nobody waits for it.
          duration: 0.2,
          ease: "power2.out",
          // Remove the inline opacity when it's done so the wrapper stops
          // being a stacking context for everything inside it.
          clearProps: "opacity",
        }
      );
    },
    { dependencies: [pathname] }
  );

  return <div ref={ref}>{children}</div>;
}
