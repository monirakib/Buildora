import type {
  AdminOverview,
  AdminUserRow,
  Broadcast,
  BroadcastAudience,
  MarketOrder,
  NotificationType,
  OrderStatus,
  Paginated,
  PriceRefreshRunSummary,
  PriceSheetImportReport,
  PriceSheetItem,
  Product,
  ProductCategory,
  UserRole,
} from "@buildora/shared";
import { API_BASE_URL, request } from "./api";

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

/** What the announcement composer sends. */
export interface BroadcastDraft {
  type: NotificationType.PROMOTION | NotificationType.SYSTEM;
  title: string;
  body: string;
  /** Optional in-app path, e.g. "/marketplace". */
  link?: string;
  audience: BroadcastAudience;
}

/**
 * POST /api/admin/broadcasts — send an announcement. The server fans it out
 * into one notification per recipient and returns the campaign record, whose
 * `recipients` is how many bells it actually landed in.
 */
export async function sendBroadcast(token: string, draft: BroadcastDraft): Promise<Broadcast> {
  const res = await request<{ data: { broadcast: Broadcast } }>("/api/admin/broadcasts", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(draft),
  });
  return res.data.broadcast;
}

/** GET /api/admin/broadcasts — the send history, newest first. */
export async function listBroadcasts(
  token: string,
  params: { page?: number } = {}
): Promise<Paginated<Broadcast>> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<Broadcast> }>(`/api/admin/broadcasts?${q}`, {
    headers: auth(token),
  });
  return res.data;
}

/** GET /api/pricing/status — recent refresh runs, for the pricing console. */
export async function getPricingStatus(
  token: string
): Promise<{ lastSuccessfulAt: string | null; runs: PriceRefreshRunSummary[] }> {
  const res = await request<{
    data: { lastSuccessfulAt: string | null; runs: PriceRefreshRunSummary[] };
  }>("/api/pricing/status", { headers: auth(token) });
  return res.data;
}

/**
 * POST /api/pricing/refresh/admin — "Refresh prices now". Fetches the latest
 * material prices and recalculates every land owner's estimate against them,
 * and only resolves once all of that is done — see the note on the route for
 * why this one, unlike the scheduled triggers, is worth waiting on.
 */
export async function triggerPriceRefresh(token: string): Promise<PriceRefreshRunSummary> {
  const res = await request<{ data: { run: PriceRefreshRunSummary } }>(
    "/api/pricing/refresh/admin",
    {
      method: "POST",
      headers: auth(token),
    }
  );
  return res.data.run;
}

/* ------------------------------------------------- the weekly price sheet --- */

/** GET /api/pricing/sheet — the live sheet plus anything awaiting approval. */
export async function getPriceSheet(
  token: string
): Promise<{ items: PriceSheetItem[]; pending: PriceSheetItem[] }> {
  const res = await request<{ data: { items: PriceSheetItem[]; pending: PriceSheetItem[] } }>(
    "/api/pricing/sheet",
    { headers: auth(token) }
  );
  return res.data;
}

/**
 * GET /api/pricing/sheet.csv — download the sheet as a file.
 *
 * Can't be a plain `<a href>`: the route needs an Authorization header, and a
 * link can't carry one. So the file is fetched, turned into a blob, and handed
 * to a link that is clicked and thrown away. The object URL is revoked
 * afterwards because it pins the whole file in memory until it is.
 */
export async function downloadPriceSheet(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/pricing/sheet.csv`, { headers: auth(token) });
  if (!res.ok) throw new Error(`Couldn't download the sheet: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `buildora-prices-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * POST /api/pricing/sheet/import — upload the week's sheet.
 *
 * Written out rather than routed through `request()` for two reasons: the body
 * is multipart, which `request` overrides with a JSON content-type, and a
 * rejected file returns its per-line errors in the *error* response, which
 * `request` throws away in favour of the message alone. Those line numbers are
 * the only thing that makes a bad file fixable, so this reads the body itself.
 */
export async function importPriceSheet(token: string, file: File): Promise<PriceSheetImportReport> {
  const form = new FormData();
  form.append("sheet", file);

  const res = await fetch(`${API_BASE_URL}/api/pricing/sheet/import`, {
    method: "POST",
    headers: auth(token),
    body: form,
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { report: PriceSheetImportReport };
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    // A validation failure still carries a report; hand it back so the console
    // can list the offending lines instead of just saying "it failed".
    if (body?.data?.report) return body.data.report;
    throw new Error(body?.error?.message ?? `Import failed: ${res.status}`);
  }
  return body!.data!.report;
}

export interface PriceItemInput {
  category: ProductCategory;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  sourceName?: string;
  sourceUrl?: string;
  effectiveFrom?: string;
}

/** POST /api/pricing/sheet/items — add an item to the sheet. */
export async function addPriceItem(token: string, input: PriceItemInput): Promise<void> {
  await request<{ data: { priceId: string } }>("/api/pricing/sheet/items", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(input),
  });
}

/**
 * PATCH /api/pricing/sheet/items/:id — record a new price for an item.
 *
 * The id names the row being superseded. Nothing is overwritten — the server
 * writes a new row beside it, which is what keeps the price history readable.
 */
export async function updatePriceItem(
  token: string,
  priceId: string,
  input: { priceBdt: number; unit?: string; sourceName?: string; effectiveFrom?: string }
): Promise<void> {
  await request<{ data: { priceId: string } }>(`/api/pricing/sheet/items/${priceId}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(input),
  });
}

/** POST /api/pricing/sheet/items/:id/retire — take an item off the sheet. */
export async function retirePriceItem(token: string, priceId: string): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/pricing/sheet/items/${priceId}/retire`, {
    method: "POST",
    headers: auth(token),
  });
}

/** POST /api/pricing/sheet/pending/:id/approve|reject — clear the review queue. */
export async function reviewPendingPrice(
  token: string,
  priceId: string,
  decision: "approve" | "reject"
): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/pricing/sheet/pending/${priceId}/${decision}`, {
    method: "POST",
    headers: auth(token),
  });
}
