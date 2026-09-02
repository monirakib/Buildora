"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductCategory, UserRole, type Product } from "@buildora/shared";
import { uploadImage } from "@/lib/api";
import {
  createProduct,
  deleteProduct,
  listMyProducts,
  updateProduct,
  type ProductInput,
} from "@/lib/apiMarket";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { categoryLabels, formatBdt } from "@/components/market/market";
import { VerifyNotice, useIsVerified } from "@/components/app/VerifyGate";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const emptyForm = {
  name: "",
  brand: "",
  category: String(ProductCategory.CEMENT),
  description: "",
  unit: "",
  priceBdt: "",
  imageUrl: "",
};

/** Sellers (suppliers & contractors) create and manage their listings here. */
export default function SellPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState(emptyForm);
  // Which listing the form is editing (null = creating a new one).
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isSeller = user?.role === UserRole.SUPPLIER || user?.role === UserRole.CONTRACTOR;
  const isVerified = useIsVerified();

  // Only sellers belong here — everyone else goes to the catalogue.
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/auth");
    else if (!isSeller) router.replace("/marketplace");
  }, [mounted, user, isSeller, router]);

  useEffect(() => {
    if (!token || !isSeller) return;
    (async () => {
      try {
        setProducts(await listMyProducts(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your listings");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, isSeller]);

  function toInput(): ProductInput {
    return {
      name: form.name,
      brand: form.brand || undefined,
      category: form.category,
      description: form.description || undefined,
      unit: form.unit,
      priceBdt: Number(form.priceBdt),
      imageUrl: form.imageUrl || undefined,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updateProduct(token, editingId, toInput());
        setProducts((list) => list.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await createProduct(token, toInput());
        setProducts((list) => [created, ...list]);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the listing");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      brand: p.brand ?? "",
      category: String(p.category),
      description: p.description ?? "",
      unit: p.unit,
      priceBdt: String(p.priceBdt),
      imageUrl: p.imageUrl ?? "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleActive(p: Product) {
    if (!token) return;
    setBusy(true);
    try {
      const updated = await updateProduct(token, p.id, { isActive: !p.isActive });
      setProducts((list) => list.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the listing");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!token || !window.confirm("Delete this listing?")) return;
    setBusy(true);
    try {
      await deleteProduct(token, id);
      setProducts((list) => list.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the listing");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      setForm((f) => ({ ...f, imageUrl: "" }));
      const url = await uploadImage(token, file);
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!mounted || !user || !isSeller) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <Link
            href="/marketplace"
            className="text-sm font-semibold text-stone-500 transition hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400"
          >
            ← Marketplace
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">My listings</h1>
          <p className="mt-2 text-stone-600 dark:text-slate-400">
            What you list here is instantly visible to every land owner on the marketplace.
          </p>

          {error && (
            <p className="mt-6 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </p>
          )}

          {/* Existing listings stay visible and editable-looking below; only the
              create/edit form is replaced, since every write it makes is gated. */}
          {!isVerified && (
            <VerifyNotice action="list products in the marketplace" className="mt-6" />
          )}

          {/* Create / edit form */}
          {isVerified && (
            <form ref={formRef} onSubmit={save} className={`mt-8 scroll-mt-28 ${cardClass}`}>
              <p className="text-sm font-bold">{editingId ? "Edit listing" : "Add a product"}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Product name, e.g. Portland Cement 50kg"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                />
                <input
                  maxLength={80}
                  placeholder="Brand (optional), e.g. Shah Cement"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  className={inputClass}
                />
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className={inputClass}
                  aria-label="Category"
                >
                  {Object.values(ProductCategory).map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    maxLength={30}
                    placeholder="Unit, e.g. bag"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className={inputClass}
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    placeholder="Price (BDT)"
                    value={form.priceBdt}
                    onChange={(e) => setForm((f) => ({ ...f, priceBdt: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Description (optional), grade, sizes, delivery area…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={`${inputClass} sm:col-span-2`}
                />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-stone-400/60 px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/25 dark:text-slate-300">
                  {uploading
                    ? "Uploading…"
                    : form.imageUrl
                      ? "Change photo"
                      : "Upload product photo"}
                  <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                </label>
                {form.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                  <img
                    src={form.imageUrl}
                    alt="Product preview"
                    className="h-24 w-32 rounded-xl object-cover"
                  />
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={busy || uploading}
                  className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy ? "Saving…" : editingId ? "Save changes" : "List product"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                    className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 transition hover:border-stone-400 dark:border-white/20 dark:text-slate-200"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Existing listings */}
          {loading ? (
            <p className="mt-8 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : products.length === 0 ? (
            <p className="mt-8 text-sm text-stone-600 dark:text-slate-400">
              No listings yet, add your first product above.
            </p>
          ) : (
            <ul className="mt-8 flex flex-col gap-4">
              {products.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center gap-4 ${cardClass}`}>
                  {p.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-16 w-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-stone-200 text-[10px] font-semibold text-stone-500 dark:bg-white/5 dark:text-slate-500">
                      No photo
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {p.name}
                      {!p.isActive && (
                        <span className="ml-2 rounded-full bg-stone-500/10 px-2 py-0.5 text-xs font-semibold text-stone-500 dark:bg-white/10 dark:text-slate-400">
                          Paused
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-slate-400">
                      {categoryLabels[p.category]} · {formatBdt(p.priceBdt)} / {p.unit}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs font-bold">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(p)}
                      className="rounded-full border border-stone-300 px-4 py-1.5 text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/20 dark:text-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleActive(p)}
                      className="rounded-full border border-stone-300 px-4 py-1.5 text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/20 dark:text-slate-200"
                    >
                      {p.isActive ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(p.id)}
                      className="rounded-full border border-rose-300/60 px-4 py-1.5 text-rose-600 transition hover:bg-rose-500/10 dark:border-rose-400/30 dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
