"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, PackageSearch, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import { UserRole, type Product } from "@buildora/shared";
import { listProducts, type ProductSort } from "@/lib/apiMarket";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { VerifiedBadge } from "@/components/app/VerifiedBadge";
import { AddToCartButton } from "@/components/market/AddToCartButton";
import {
  CatalogueFilters,
  EMPTY_FILTERS,
  type CatalogueFilterState,
} from "@/components/market/CatalogueFilters";
import { categoryLabels, formatBdt } from "@/components/market/market";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import { surfaceClass } from "@/components/ui/surface";
import { imageAt } from "@/lib/imageUrl";

const sortOptions: { value: ProductSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

/** One listing in the catalogue grid. */
function ProductCard({ product: p }: { product: Product }) {
  // The add-to-cart flight starts from the photo, so the card hands it over.
  const imageRef = useRef<HTMLDivElement>(null);

  return (
    <article
      className={`group spotlight flex flex-col overflow-hidden ${surfaceClass} transition-[translate,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-amber-400/60 hover:shadow-2xl hover:shadow-amber-900/10 dark:hover:shadow-black/40`}
    >
      <div ref={imageRef} className="zoom-media relative">
        {p.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
          <img
            src={imageAt(p.imageUrl, 640)}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="aspect-4/3 w-full object-cover"
          />
        ) : (
          <div className="grid aspect-4/3 w-full place-items-center bg-stone-200/80 text-stone-400 dark:bg-white/5 dark:text-slate-500">
            <ShoppingBag className="h-8 w-8" />
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full border border-white/40 bg-stone-950/60 px-2.5 py-1 text-[0.68rem] font-bold tracking-wide text-white uppercase backdrop-blur">
          {categoryLabels[p.category]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="leading-snug font-bold">{p.name}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500 dark:text-slate-400">
          {p.brand && <span>{p.brand} ·</span>}
          <span className="truncate">{p.seller.company || p.seller.name}</span>
          <VerifiedBadge status={p.seller.verificationStatus} />
        </p>
        {p.description && (
          <p className="mt-2.5 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
            {p.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
            {formatBdt(p.priceBdt)}
            <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">
              {" "}
              / {p.unit}
            </span>
          </p>
          <AddToCartButton product={p} imageEl={imageRef} size="md" />
        </div>
      </div>
    </article>
  );
}

export default function MarketplacePage() {
  const user = useSession((s) => s.user);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [priceMaxBdt, setPriceMaxBdt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogueFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<ProductSort>("newest");
  // Below lg the sidebar folds behind a "Filters" button.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLandOwner = mounted && user?.role === UserRole.LAND_OWNER;
  const isSeller =
    mounted && (user?.role === UserRole.SUPPLIER || user?.role === UserRole.CONTRACTOR);

  // Refetch when any filter (search text debounced) or the sort changes.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await listProducts({ ...filters, sort });
        setProducts(page.items);
        setTotal(page.total);
        setPriceMaxBdt(page.priceMaxBdt);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the marketplace");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, sort]);

  // The active filters, as removable chips above the grid.
  const active: { key: keyof CatalogueFilterState; label: string }[] = [];
  if (filters.search) active.push({ key: "search", label: `“${filters.search}”` });
  if (filters.category)
    active.push({
      key: "category",
      label: categoryLabels[filters.category as keyof typeof categoryLabels],
    });
  if (filters.minPrice || filters.maxPrice)
    active.push({
      key: "minPrice",
      label: `${formatBdt(filters.minPrice)} – ${filters.maxPrice ? formatBdt(filters.maxPrice) : "any"}`,
    });
  const filtered = active.length > 0;

  function clearFilter(key: keyof CatalogueFilterState) {
    setFilters((f) =>
      key === "minPrice" ? { ...f, minPrice: 0, maxPrice: 0 } : { ...f, [key]: "" }
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <PageHeader
            eyebrow="Marketplace"
            title="Materials, straight from the source"
            description="Cement, steel, bricks, and everything else, listed by suppliers and contractors and delivered to your site."
            actions={
              isSeller ? (
                <Link href="/marketplace/sell" className="btn-primary px-6 py-2.5 text-sm">
                  Manage my listings
                  <ArrowRight className="btn-arrow h-4 w-4" />
                </Link>
              ) : isLandOwner ? (
                <Link href="/marketplace/orders" className="btn-secondary px-5 py-2.5 text-sm">
                  Your orders
                </Link>
              ) : undefined
            }
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
            {/* ---------- Left column: filters ---------- */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls="catalogue-filters"
                className="btn-secondary w-full px-4 py-2.5 text-sm lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {active.length > 0 && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-extrabold text-stone-950 tabular-nums">
                    {active.length}
                  </span>
                )}
              </button>
              <div
                id="catalogue-filters"
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out lg:grid-rows-[1fr] lg:opacity-100 ${
                  filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden lg:overflow-visible">
                  <div className="pt-3 lg:pt-0">
                    <CatalogueFilters
                      value={filters}
                      onChange={setFilters}
                      priceMaxBdt={priceMaxBdt}
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* ---------- Right column: results ---------- */}
            <section aria-label="Products" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p
                  aria-live="polite"
                  className="text-sm font-bold text-stone-600 dark:text-slate-400"
                >
                  {loading ? (
                    <span className="loading-dots">Finding products</span>
                  ) : (
                    <>
                      {total} product{total === 1 ? "" : "s"}
                      {filtered ? " found" : ""}
                    </>
                  )}
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-stone-500 dark:text-slate-400">Sort by</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as ProductSort)}
                    className="rounded-full border border-stone-300/80 bg-white/70 py-1.5 pr-8 pl-3.5 text-sm font-semibold text-stone-900 transition outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                  >
                    {sortOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Active filters, each one removable on its own. */}
              {filtered && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {active.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => clearFilter(a.key)}
                      aria-label={`Remove filter ${a.label}`}
                      className="chip animate-rise-in gap-1.5 py-1 pr-2 text-xs"
                      aria-pressed="true"
                    >
                      {a.label}
                      <X className="h-3 w-3 opacity-70" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="btn-ghost px-3 py-1 text-xs"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {error && <Alert className="mt-5">{error}</Alert>}

              {loading ? (
                <CardGridSkeleton
                  count={6}
                  className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                />
              ) : products.length === 0 ? (
                <EmptyState
                  className="mt-5"
                  icon={<PackageSearch className="h-7 w-7" />}
                  title={filtered ? "Nothing matches" : "Nothing listed yet"}
                  description={
                    filtered
                      ? "Try a different word, widen the price band, or clear the category."
                      : "Suppliers haven't listed anything yet. Check back soon."
                  }
                  action={
                    filtered ? (
                      <button
                        type="button"
                        onClick={() => setFilters(EMPTY_FILTERS)}
                        className="btn-secondary px-5 py-2 text-sm"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <Stagger
                  className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                  dependencies={[products]}
                >
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </Stagger>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
