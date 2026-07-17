"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrderStatus, type MarketOrder, type Product } from "@buildora/shared";
import { listAdminOrders, listAdminProducts, setProductActive } from "@/lib/apiAdmin";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { bdtFull, mediumDate, statusLabel } from "@/components/admin/format";

/** Order status chip — color + icon + label, never color alone. */
function OrderChip({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, { cls: string; icon: React.ReactNode }> = {
    [OrderStatus.PLACED]: {
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </>
      ),
    },
    [OrderStatus.CONFIRMED]: {
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
      icon: <path d="m5 13 4 4L19 7" />,
    },
    [OrderStatus.DELIVERED]: {
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
      icon: (
        <>
          <path d="m2 13 4 4L14 9" />
          <path d="m10 13 4 4L22 9" />
        </>
      ),
    },
    [OrderStatus.CANCELLED]: {
      cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
      icon: <path d="M6 6l12 12M18 6 6 18" />,
    },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold whitespace-nowrap ${s.cls}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {s.icon}
      </svg>
      {statusLabel(status)}
    </span>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-stone-500 dark:text-stone-400">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-stone-200 px-3.5 py-2 font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={to >= total}
          className="rounded-lg border border-stone-200 px-3.5 py-2 font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

const tableWrapClass =
  "overflow-x-auto rounded-2xl border border-stone-200/80 bg-white dark:border-white/10 dark:bg-stone-900";
const theadClass =
  "border-b border-stone-200/80 text-xs font-bold tracking-wider text-stone-500 uppercase dark:border-white/10 dark:text-stone-400";

export default function AdminMarketPage() {
  const token = useSession((s) => s.token);
  const [tab, setTab] = useState<"listings" | "orders">("listings");

  // Listings state
  const [search, setSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  // null until that tab has loaded once — so the tab label never shows a fake 0
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [productPageSize, setProductPageSize] = useState(20);

  // Orders state
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [orderPage, setOrderPage] = useState(1);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [orderPageSize, setOrderPageSize] = useState(20);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "listings") {
        const res = await listAdminProducts(token, { search, page: productPage });
        setProducts(res.items);
        setProductTotal(res.total);
        setProductPageSize(res.pageSize);
      } else {
        const res = await listAdminOrders(token, { status, page: orderPage });
        setOrders(res.items);
        setOrderTotal(res.total);
        setOrderPageSize(res.pageSize);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, tab, search, productPage, status, orderPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleActive(product: Product) {
    if (!token) return;
    if (
      product.isActive &&
      !window.confirm(`Delist “${product.name}”? Buyers won't see it until it's relisted.`)
    ) {
      return;
    }
    try {
      const updated = await setProductActive(token, product.id, !product.isActive);
      setProducts((ps) => ps.map((p) => (p.id === product.id ? updated : p)));
      showToast(
        updated.isActive ? `“${updated.name}” is live again` : `“${updated.name}” delisted`
      );
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  return (
    <AdminShell title="Marketplace" subtitle="Every listing and order on the platform">
      {/* ---- Tabs ---- */}
      <div className="mb-5 flex gap-1.5 rounded-xl bg-stone-200/60 p-1 sm:w-fit dark:bg-white/5">
        {(
          [
            ["listings", productTotal === null ? "Listings" : `Listings (${productTotal})`],
            ["orders", orderTotal === null ? "Orders" : `Orders (${orderTotal})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold whitespace-nowrap transition sm:flex-none ${
              tab === key
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white"
                : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === "listings" ? (
        <>
          <div className="mb-5">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setProductPage(1);
              }}
              placeholder="Search products or brands…"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 sm:max-w-xs dark:border-white/10 dark:bg-stone-900"
            />
          </div>

          <div className={tableWrapClass}>
            <table className="w-full min-w-190 text-left text-sm">
              <thead>
                <tr className={theadClass}>
                  <th className="px-5 py-3.5">Product</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Seller</th>
                  <th className="px-4 py-3.5">Price</th>
                  <th className="px-4 py-3.5">Listed</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-white/5">
                {loading && products.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-4">
                      <div className="h-8 animate-pulse rounded-lg bg-stone-100 dark:bg-white/5" />
                    </td>
                  </tr>
                )}
                {!loading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-stone-400 dark:text-stone-500"
                    >
                      No listings match this search
                    </td>
                  </tr>
                )}
                {products.map((p) => (
                  <tr key={p.id} className="transition hover:bg-stone-50 dark:hover:bg-white/2.5">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className={`h-10 w-10 shrink-0 rounded-lg object-cover ${p.isActive ? "" : "opacity-40 grayscale"}`}
                          />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400 dark:bg-white/5">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4.5 w-4.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="9" cy="9" r="2" />
                              <path d="m21 15-3.5-3.5L6 23" />
                            </svg>
                          </span>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`truncate font-bold ${p.isActive ? "" : "text-stone-400 line-through dark:text-stone-500"}`}
                          >
                            {p.name}
                          </p>
                          {p.brand && (
                            <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                              {p.brand}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                      {statusLabel(p.category)}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="truncate text-stone-600 dark:text-stone-300">{p.seller.name}</p>
                      {p.seller.company && (
                        <p className="truncate text-xs text-stone-400 dark:text-stone-500">
                          {p.seller.company}
                        </p>
                      )}
                    </td>
                    <td
                      className="px-4 py-3.5 font-bold whitespace-nowrap"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {bdtFull(p.priceBdt)}
                      <span className="font-normal text-stone-400 dark:text-stone-500">
                        {" "}
                        / {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                      {mediumDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[0.7rem] font-bold whitespace-nowrap ${
                          p.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-400"
                        }`}
                      >
                        {p.isActive ? "Live" : "Delisted"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleActive(p)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                          p.isActive
                            ? "border-stone-200 text-stone-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:text-stone-300 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                        }`}
                      >
                        {p.isActive ? "Delist" : "Relist"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={productPage}
            pageSize={productPageSize}
            total={productTotal ?? 0}
            onPage={setProductPage}
          />
        </>
      ) : (
        <>
          <div className="mb-5">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OrderStatus | "");
                setOrderPage(1);
              }}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-amber-500 dark:border-white/10 dark:bg-stone-900"
            >
              <option value="">All statuses</option>
              {Object.values(OrderStatus).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div className={tableWrapClass}>
            <table className="w-full min-w-190 text-left text-sm">
              <thead>
                <tr className={theadClass}>
                  <th className="px-5 py-3.5">Order</th>
                  <th className="px-4 py-3.5">Buyer</th>
                  <th className="px-4 py-3.5">Seller</th>
                  <th className="px-4 py-3.5 text-right">Qty</th>
                  <th className="px-4 py-3.5 text-right">Total</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-white/5">
                {loading && orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-4">
                      <div className="h-8 animate-pulse rounded-lg bg-stone-100 dark:bg-white/5" />
                    </td>
                  </tr>
                )}
                {!loading && orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-stone-400 dark:text-stone-500"
                    >
                      No orders with this status
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id} className="transition hover:bg-stone-50 dark:hover:bg-white/2.5">
                    <td className="px-5 py-3.5">
                      <p className="truncate font-bold">{o.product.name}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                        {o.product.brand ? `${o.product.brand} · ` : ""}
                        {bdtFull(o.product.priceBdt)} / {o.product.unit}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="truncate text-stone-600 dark:text-stone-300">{o.buyer.name}</p>
                      <p className="truncate text-xs text-stone-400 dark:text-stone-500">
                        {o.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="truncate text-stone-600 dark:text-stone-300">{o.seller.name}</p>
                      {o.seller.company && (
                        <p className="truncate text-xs text-stone-400 dark:text-stone-500">
                          {o.seller.company}
                        </p>
                      )}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right whitespace-nowrap text-stone-600 dark:text-stone-300"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {o.quantity.toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right font-bold whitespace-nowrap"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {bdtFull(o.totalBdt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <OrderChip status={o.status} />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                      {mediumDate(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={orderPage}
            pageSize={orderPageSize}
            total={orderTotal ?? 0}
            onPage={setOrderPage}
          />
        </>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-50 rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl dark:bg-white dark:text-stone-950"
        >
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
