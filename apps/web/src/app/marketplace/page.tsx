"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductCategory, UserRole, type Product } from "@buildora/shared";
import { listProducts, placeOrder } from "@/lib/apiMarket";
import { DeliveryEstimatePanel } from "@/components/market/DeliveryEstimatePanel";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { VerifiedBadge } from "@/components/app/VerifiedBadge";
import { categoryLabels, formatBdt } from "@/components/market/market";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/** Order form modal for one product — quantity, delivery details, done. */
function OrderModal({
  product,
  token,
  onClose,
}: {
  product: Product;
  token: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ quantity: "1", deliveryAddress: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Math.max(1, Number(form.quantity) || 1);
  const total = qty * product.priceBdt;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await placeOrder(token, {
        productId: product.id,
        quantity: qty,
        deliveryAddress: form.deliveryAddress,
        phone: form.phone,
        note: form.note || undefined,
      });
      setPlaced(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-white/40 bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:p-7 dark:border-white/15 dark:bg-stone-950/90"
      >
        {placed ? (
          <div className="text-center">
            <p className="text-lg font-extrabold">Order placed ✓</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
              {product.seller.name} has been notified. Track it under{" "}
              <Link
                href="/marketplace/orders"
                className="text-amber-600 underline underline-offset-2 dark:text-amber-400"
              >
                your orders
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-amber-400 px-8 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-lg font-extrabold tracking-tight">Order {product.name}</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
              {formatBdt(product.priceBdt)} per {product.unit} · sold by {product.seller.name}
            </p>

            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <div>
                <label htmlFor="qty" className="mb-1.5 block text-sm font-semibold">
                  Quantity ({product.unit})
                </label>
                <input
                  id="qty"
                  type="number"
                  min={1}
                  max={100000}
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className={inputClass}
                />
              </div>
              {/* Distance and ETA before they commit. Picking a project also
                  fills the address in, since the plot already has one. */}
              <DeliveryEstimatePanel
                productId={product.id}
                token={token}
                onProjectPicked={(project) =>
                  setForm((f) => ({
                    ...f,
                    // Never overwrite something they've already typed.
                    deliveryAddress:
                      f.deliveryAddress.trim() === ""
                        ? `${project.address}, ${project.areaName}`
                        : f.deliveryAddress,
                  }))
                }
              />

              <div>
                <label htmlFor="address" className="mb-1.5 block text-sm font-semibold">
                  Delivery address
                </label>
                <textarea
                  id="address"
                  rows={2}
                  required
                  minLength={10}
                  maxLength={300}
                  placeholder="House, road, area, city"
                  value={form.deliveryAddress}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold">
                  Contact phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  required
                  minLength={6}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="note" className="mb-1.5 block text-sm font-semibold">
                  Note{" "}
                  <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
                </label>
                <input
                  id="note"
                  type="text"
                  maxLength={500}
                  placeholder="e.g. deliver before 5pm"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                  {error}
                </p>
              )}

              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm font-bold">
                  Total:{" "}
                  <span className="text-amber-600 dark:text-amber-400">{formatBdt(total)}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 transition hover:border-stone-400 dark:border-white/20 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {busy ? "Placing…" : "Place order"}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [ordering, setOrdering] = useState<Product | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLandOwner = mounted && user?.role === UserRole.LAND_OWNER;
  const isSeller =
    mounted && (user?.role === UserRole.SUPPLIER || user?.role === UserRole.CONTRACTOR);

  // Refetch when the search text (debounced) or category chip changes.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await listProducts({ search, category });
        setProducts(page.items);
        setTotal(page.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the marketplace");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, category]);

  function handleOrderClick(product: Product) {
    if (!token) {
      router.push("/auth");
      return;
    }
    if (isLandOwner) setOrdering(product);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                Marketplace
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Materials, straight from the source
              </h1>
              <p className="mt-2 max-w-xl text-stone-600 dark:text-slate-400">
                Cement, steel, bricks, and everything else — listed by suppliers and contractors,
                delivered to your site. Order anything, any time.
              </p>
            </div>
            {isSeller && (
              <Link
                href="/marketplace/sell"
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
              >
                Manage my listings
              </Link>
            )}
          </div>

          {/* Search + category chips */}
          <div className="mt-8 flex flex-col gap-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, brands…"
              className={`${inputClass} max-w-md`}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  category === ""
                    ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
                    : "border border-stone-300 text-stone-600 hover:border-amber-500 dark:border-white/15 dark:text-slate-300"
                }`}
              >
                All
              </button>
              {Object.values(ProductCategory).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    category === c
                      ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
                      : "border border-stone-300 text-stone-600 hover:border-amber-500 dark:border-white/15 dark:text-slate-300"
                  }`}
                >
                  {categoryLabels[c]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-8 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </p>
          )}

          {/* Catalogue grid */}
          {loading ? (
            <p className="mt-10 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : products.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-white/50 bg-white/55 p-10 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
              <p className="font-bold">No products found</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                {search || category
                  ? "Try a different search or category."
                  : "Suppliers haven't listed anything yet — check back soon."}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-8 text-xs font-bold text-stone-500 dark:text-slate-500">
                {total} product{total === 1 ? "" : "s"}
              </p>
              <Stagger
                className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                dependencies={[products]}
              >
                {products.map((p) => (
                  <article
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/55 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5"
                  >
                    {p.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        loading="lazy"
                        className="aspect-4/3 w-full object-cover"
                      />
                    ) : (
                      <div className="grid aspect-4/3 w-full place-items-center bg-stone-200 text-xs font-semibold text-stone-500 dark:bg-white/5 dark:text-slate-500">
                        No photo
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="font-bold">{p.name}</h2>
                          {p.brand && (
                            <p className="text-xs font-semibold text-stone-500 dark:text-slate-400">
                              {p.brand}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
                          {categoryLabels[p.category]}
                        </span>
                      </div>
                      {p.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
                          {p.description}
                        </p>
                      )}
                      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                        <div>
                          <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                            {formatBdt(p.priceBdt)}
                            <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">
                              {" "}
                              / {p.unit}
                            </span>
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
                            {p.seller.name}
                            <VerifiedBadge status={p.seller.verificationStatus} />
                          </p>
                        </div>
                        {(!mounted || !user || isLandOwner) && (
                          <button
                            type="button"
                            onClick={() => handleOrderClick(p)}
                            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                          >
                            Order
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </Stagger>
            </>
          )}
        </div>
      </main>

      {ordering && token && (
        <OrderModal product={ordering} token={token} onClose={() => setOrdering(null)} />
      )}
    </div>
  );
}
