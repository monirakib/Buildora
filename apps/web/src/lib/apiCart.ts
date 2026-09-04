import type { Cart, CartCheckoutInput, MarketOrder } from "@buildora/shared";
import { request } from "./api";

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

/** GET /api/marketplace/cart */
export async function fetchCart(token: string): Promise<Cart> {
  const res = await request<{ data: { cart: Cart } }>("/api/marketplace/cart", {
    headers: authed(token),
  });
  return res.data.cart;
}

/** POST /api/marketplace/cart/items — adds `quantity` more of a product. */
export async function addCartItem(token: string, productId: string, quantity = 1): Promise<Cart> {
  const res = await request<{ data: { cart: Cart } }>("/api/marketplace/cart/items", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ productId, quantity }),
  });
  return res.data.cart;
}

/** PATCH /api/marketplace/cart/items/:productId — sets a line's quantity (0 removes). */
export async function setCartItem(
  token: string,
  productId: string,
  quantity: number
): Promise<Cart> {
  const res = await request<{ data: { cart: Cart } }>(`/api/marketplace/cart/items/${productId}`, {
    method: "PATCH",
    headers: authed(token),
    body: JSON.stringify({ quantity }),
  });
  return res.data.cart;
}

/** DELETE /api/marketplace/cart/items/:productId */
export async function removeCartItem(token: string, productId: string): Promise<Cart> {
  const res = await request<{ data: { cart: Cart } }>(`/api/marketplace/cart/items/${productId}`, {
    method: "DELETE",
    headers: authed(token),
  });
  return res.data.cart;
}

/** DELETE /api/marketplace/cart */
export async function clearCart(token: string): Promise<Cart> {
  const res = await request<{ data: { cart: Cart } }>("/api/marketplace/cart", {
    method: "DELETE",
    headers: authed(token),
  });
  return res.data.cart;
}

/** POST /api/marketplace/cart/checkout — one order per line, then an empty cart. */
export async function checkoutCart(
  token: string,
  input: CartCheckoutInput
): Promise<{ orders: MarketOrder[]; cart: Cart }> {
  const res = await request<{ data: { orders: MarketOrder[]; cart: Cart } }>(
    "/api/marketplace/cart/checkout",
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data;
}
