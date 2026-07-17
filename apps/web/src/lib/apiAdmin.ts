import type {
  AdminOverview,
  AdminUserRow,
  MarketOrder,
  OrderStatus,
  Paginated,
  Product,
  UserRole,
} from "@buildora/shared";
import { request } from "./api";

// Every admin endpoint requires the admin's JWT.
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** GET /api/admin/overview — all dashboard numbers in one call. */
export async function getAdminOverview(token: string): Promise<AdminOverview> {
  const res = await request<{ data: { overview: AdminOverview } }>("/api/admin/overview", {
    headers: auth(token),
  });
  return res.data.overview;
}

/** GET /api/admin/users — the user-management table. */
export async function listAdminUsers(
  token: string,
  params: { search?: string; role?: UserRole | ""; page?: number }
): Promise<Paginated<AdminUserRow>> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.role) q.set("role", params.role);
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<AdminUserRow> }>(`/api/admin/users?${q}`, {
    headers: auth(token),
  });
  return res.data;
}

/**
 * PATCH /api/admin/users/:id/role — reassign a role. The server also signs
 * the user out everywhere, since their old token still claims the old role.
 */
export async function setUserRole(token: string, userId: string, role: UserRole): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ role }),
  });
}

/** POST /api/admin/users/:id/revoke-sessions — returns how many logins died. */
export async function revokeUserSessions(token: string, userId: string): Promise<number> {
  const res = await request<{ data: { revoked: number } }>(
    `/api/admin/users/${userId}/revoke-sessions`,
    { method: "POST", headers: auth(token) }
  );
  return res.data.revoked;
}

/** GET /api/admin/market/products — every listing, delisted ones included. */
export async function listAdminProducts(
  token: string,
  params: { search?: string; page?: number }
): Promise<Paginated<Product>> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<Product> }>(`/api/admin/market/products?${q}`, {
    headers: auth(token),
  });
  return res.data;
}

/** PATCH /api/admin/market/products/:id — delist or relist a product. */
export async function setProductActive(
  token: string,
  productId: string,
  isActive: boolean
): Promise<Product> {
  const res = await request<{ data: { product: Product } }>(
    `/api/admin/market/products/${productId}`,
    { method: "PATCH", headers: auth(token), body: JSON.stringify({ isActive }) }
  );
  return res.data.product;
}

/** GET /api/admin/market/orders — every marketplace order. */
export async function listAdminOrders(
  token: string,
  params: { status?: OrderStatus | ""; page?: number }
): Promise<Paginated<MarketOrder>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<MarketOrder> }>(`/api/admin/market/orders?${q}`, {
    headers: auth(token),
  });
  return res.data;
}
