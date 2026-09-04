"use client";

import { useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import { CART_BUTTON_ID } from "@/lib/flyToCart";
import { useCart } from "@/store/useCart";
import { useSession } from "@/store/useSession";

/**
 * The cart button in the navbar: icon, count badge, opens the drawer.
 *
 * Also the place the cart is first read from the server: it mounts on every
 * page for a signed-in land owner, so loading here means the badge is right
 * before the marketplace is ever opened.
 *
 * The badge re-mounts on every add (`key={addedTick}`), which restarts its
 * bump keyframe. A keyframe is fine here even though adds can come quickly:
 * the element is replaced, not retargeted, so there is nothing to interrupt.
 */
export function CartButton() {
  const token = useSession((s) => s.token);
  const count = useCart((s) => s.cart.count);
  const loaded = useCart((s) => s.loaded);
  const addedTick = useCart((s) => s.addedTick);
  const load = useCart((s) => s.load);
  const openDrawer = useCart((s) => s.openDrawer);

  useEffect(() => {
    if (token && !loaded) load(token);
  }, [token, loaded, load]);

  return (
    <button
      id={CART_BUTTON_ID}
      type="button"
      onClick={openDrawer}
      aria-label={count > 0 ? `Cart (${count} item${count === 1 ? "" : "s"})` : "Cart"}
      className="relative grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/15 text-white/85 backdrop-blur transition hover:border-white/40 hover:bg-white/25 hover:text-white"
    >
      <span key={`icon-${addedTick}`} className={addedTick > 0 ? "animate-bump" : ""}>
        <ShoppingCart className="h-4.5 w-4.5" />
      </span>
      {count > 0 && (
        <span
          key={`badge-${addedTick}`}
          className={`absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[0.65rem] font-extrabold text-stone-950 tabular-nums shadow-md ${
            addedTick > 0 ? "animate-bump" : "animate-check-pop"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
