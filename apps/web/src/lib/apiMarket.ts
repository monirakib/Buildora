import type { MarketOrder, OrderStatus, Paginated, Product } from "@buildora/shared";
import { request } from "./api";

/* ---------- Catalogue ---------- */

/** GET /api/marketplace/products — public catalogue with search + filter. */
export type ProductSort = "newest" | "price_asc" | "price_desc";

export interface CatalogueQuery {
  search?: string;
  category?: string;
  page?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
}

/** A page of the catalogue, plus the dearest listing overall for the price slider. */
export type CataloguePage = Paginated<Product> & { priceMaxBdt: number };

export async function listProducts(params: CatalogueQuery): Promise<CataloguePage> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.page) qs.set("page", String(params.page));
  if (params.minPrice) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice) qs.set("maxPrice", String(params.maxPrice));
  if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
  const res = await request<{ data: CataloguePage }>(`/api/marketplace/products?${qs.toString()}`);
  return res.data;
}

/* ---------- Seller listings ---------- */

export interface ProductInput {
  name: string;
  brand?: string;
  category: string;
  description?: string;
  unit: string;
  priceBdt: number;
  imageUrl?: string;
  isActive?: boolean;
}

export async function listMyProducts(token: string): Promise<Product[]> {
  const res = await request<{ data: { products: Product[] } }>("/api/marketplace/products/mine", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.products;
}

export async function createProduct(token: string, input: ProductInput): Promise<Product> {
  const res = await request<{ data: { product: Product } }>("/api/marketplace/products", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.product;
}

export async function updateProduct(
  token: string,
  id: string,
  input: Partial<ProductInput>
): Promise<Product> {
  const res = await request<{ data: { product: Product } }>(`/api/marketplace/products/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.product;
}

export async function deleteProduct(token: string, id: string): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/marketplace/products/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listOrders(token: string): Promise<MarketOrder[]> {
  const res = await request<{ data: { orders: MarketOrder[] } }>("/api/marketplace/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.orders;
}

export async function updateOrderStatus(
  token: string,
  id: string,
  status: OrderStatus,
  /** Required when confirming — the date the seller promises the buyer. */
  extra?: { expectedDeliveryAt?: string; note?: string }
): Promise<MarketOrder> {
  const res = await request<{ data: { order: MarketOrder } }>(
    `/api/marketplace/orders/${id}/status`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, ...extra }),
    }
  );
  return res.data.order;
}
