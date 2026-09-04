import { create } from "zustand";
import type { Cart, CartCheckoutInput, CartLine, MarketOrder, Product } from "@buildora/shared";
import * as api from "@/lib/apiCart";

const EMPTY: Cart = { items: [], count: 0, subtotalBdt: 0 };

/** Recomputes the totals from the lines, for optimistic updates. */
function fromLines(items: CartLine[]): Cart {
  return {
    items,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotalBdt: items.reduce((sum, line) => sum + line.quantity * line.product.priceBdt, 0),
  };
}

interface CartState {
  cart: Cart;
  /** True once the server copy has been read at least once this session. */
  loaded: boolean;
  open: boolean;
  /**
   * Increments on every successful add. The cart button keys its bump
   * animation on it, so the badge pops for each add rather than only when
   * the count changes (adding one more of something already there also
   * deserves the pop).
   */
  addedTick: number;
  load: (token: string) => Promise<void>;
  add: (token: string, product: Product, quantity?: number) => Promise<void>;
  setQuantity: (token: string, productId: string, quantity: number) => void;
  remove: (token: string, productId: string) => Promise<void>;
  clear: (token: string) => Promise<void>;
  checkout: (token: string, input: CartCheckoutInput) => Promise<MarketOrder[]>;
  openDrawer: () => void;
  closeDrawer: () => void;
  reset: () => void;
}

/**
 * The cart, mirrored from the server.
 *
 * Every change is applied locally first and confirmed by the API's reply,
 * which is the whole cart as the server now sees it. So the badge and the
 * drawer respond on the click, and if the request fails the store reloads
 * from the server and the UI settles back to the truth.
 */
export const useCart = create<CartState>((set, get) => {
  // Quantity edits are debounced per product: stepping 1 → 5 sends one PATCH,
  // not four. The timers live here so they survive re-renders.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  async function resync(token: string) {
    try {
      set({ cart: await api.fetchCart(token), loaded: true });
    } catch {
      /* Leave what we have; the next action will try again. */
    }
  }

  return {
    cart: EMPTY,
    loaded: false,
    open: false,
    addedTick: 0,

    load: async (token) => {
      try {
        set({ cart: await api.fetchCart(token), loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    add: async (token, product, quantity = 1) => {
      const { cart } = get();
      const existing = cart.items.find((line) => line.product.id === product.id);
      const items = existing
        ? cart.items.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + quantity } : line
          )
        : [...cart.items, { product, quantity }];
      set({ cart: fromLines(items), addedTick: get().addedTick + 1 });
      try {
        set({ cart: await api.addCartItem(token, product.id, quantity) });
      } catch (err) {
        await resync(token);
        throw err;
      }
    },

    setQuantity: (token, productId, quantity) => {
      const clamped = Math.max(0, Math.min(100000, Math.round(quantity)));
      const items = get()
        .cart.items.map((line) =>
          line.product.id === productId ? { ...line, quantity: clamped } : line
        )
        .filter((line) => line.quantity > 0);
      set({ cart: fromLines(items) });

      const timer = pending.get(productId);
      if (timer) clearTimeout(timer);
      pending.set(
        productId,
        setTimeout(async () => {
          pending.delete(productId);
          try {
            set({ cart: await api.setCartItem(token, productId, clamped) });
          } catch {
            await resync(token);
          }
        }, 350)
      );
    },

    remove: async (token, productId) => {
      const timer = pending.get(productId);
      if (timer) clearTimeout(timer);
      set({ cart: fromLines(get().cart.items.filter((line) => line.product.id !== productId)) });
      try {
        set({ cart: await api.removeCartItem(token, productId) });
      } catch {
        await resync(token);
      }
    },

    clear: async (token) => {
      set({ cart: EMPTY });
      try {
        set({ cart: await api.clearCart(token) });
      } catch {
        await resync(token);
      }
    },

    checkout: async (token, input) => {
      const { orders, cart } = await api.checkoutCart(token, input);
      set({ cart });
      return orders;
    },

    openDrawer: () => set({ open: true }),
    closeDrawer: () => set({ open: false }),
    reset: () => set({ cart: EMPTY, loaded: false, open: false }),
  };
});
