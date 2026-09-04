"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  UserRole,
  type CartLine,
  type DeliveryEstimate,
  type MarketOrder,
  type Project,
} from "@buildora/shared";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Alert } from "@/components/ui/Alert";
import { Button, DrawnCheck } from "@/components/ui/Button";
import { estimateDelivery } from "@/lib/apiEstimator";
import { listMyProjects } from "@/lib/apiProjects";
import { imageAt } from "@/lib/imageUrl";
import { useCart } from "@/store/useCart";
import { useSession } from "@/store/useSession";
import { toast } from "@/store/useToast";
import { formatBdt } from "./market";

type Step = "cart" | "checkout" | "done";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

/** − 3 +, with the number itself editable. */
function Stepper({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const round =
    "grid h-8 w-8 place-items-center rounded-full text-stone-600 transition hover:bg-stone-900/8 hover:text-stone-900 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white";
  return (
    <div className="inline-flex items-center rounded-full border border-stone-300/80 bg-white/60 p-0.5 dark:border-white/15 dark:bg-white/5">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label="One less"
        className={round}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min={0}
        max={100000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label={`Quantity in ${unit}`}
        className="w-12 bg-transparent text-center text-sm font-bold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="One more"
        className={round}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LineItem({
  line,
  estimate,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  estimate?: DeliveryEstimate;
  onQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  const { product, quantity } = line;
  return (
    <li className="animate-rise-in flex gap-3.5 py-4">
      {product.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
        <img
          src={imageAt(product.imageUrl, 160)}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-stone-200 text-stone-400 dark:bg-white/5 dark:text-slate-500">
          <ShoppingBag className="h-5 w-5" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold">{product.name}</p>
            <p className="truncate text-xs text-stone-500 dark:text-slate-400">
              {product.brand ? `${product.brand} · ` : ""}
              {product.seller.company || product.seller.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${product.name}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <Stepper value={quantity} unit={product.unit} onChange={onQuantity} />
          <p className="text-right">
            <span className="block font-extrabold">
              <AnimatedNumber value={quantity * product.priceBdt} format={formatBdt} />
            </span>
            <span className="block text-[0.7rem] text-stone-500 dark:text-slate-400">
              {formatBdt(product.priceBdt)} / {product.unit}
            </span>
          </p>
        </div>

        {estimate?.route && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Truck className="h-3.5 w-3.5" />
            {estimate.route.distanceKm} km · about {estimate.route.durationMin} min by road
          </p>
        )}
        {estimate?.unavailableReason && (
          <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-stone-500 dark:text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {estimate.unavailableReason}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The cart, as a sheet that slides in from the right.
 *
 * Mounted once in the root layout for a signed-in land owner (nothing renders
 * for anyone else). The panel stays in the DOM while closed, translated off
 * the right edge, so opening and closing are one transition each way rather
 * than a mount and an unmount. `inert` keeps its controls out of the tab
 * order while it is off screen.
 *
 * Three steps live inside it: the lines, the checkout form, and the "done"
 * screen. Checkout is here rather than on a separate page because the whole
 * flow is short (one address, one phone number) and leaving the marketplace
 * to finish it would lose the buyer's place in the catalogue.
 */
export function CartDrawer() {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const open = useCart((s) => s.open);
  const cart = useCart((s) => s.cart);
  const loaded = useCart((s) => s.loaded);
  const load = useCart((s) => s.load);
  const close = useCart((s) => s.closeDrawer);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const checkout = useCart((s) => s.checkout);

  const [step, setStep] = useState<Step>("cart");
  const [placed, setPlaced] = useState<MarketOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checkout form.
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ projectId: "", deliveryAddress: "", phone: "", note: "" });
  const [estimates, setEstimates] = useState<Record<string, DeliveryEstimate>>({});
  const [routing, setRouting] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isBuyer = mounted && user?.role === UserRole.LAND_OWNER;

  useEffect(() => {
    if (token && isBuyer && !loaded) load(token);
  }, [token, isBuyer, loaded, load]);

  // Escape closes; the page behind stops scrolling while the sheet owns the
  // screen. Opening also puts the sheet back on its first step, so a buyer who
  // closed it mid-checkout returns to their cart, not to a half-filled form.
  useEffect(() => {
    if (!open) return;
    setStep("cart");
    setError(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  // The checkout form needs the buyer's projects (to pick a delivery site) and
  // their phone number. Both are fetched once, the first time checkout opens.
  useEffect(() => {
    if (step !== "checkout" || !token) return;
    setForm((f) => ({ ...f, phone: f.phone || user?.phone || "" }));
    if (projects.length === 0) {
      listMyProjects(token)
        .then(setProjects)
        .catch(() => setProjects([]));
    }
  }, [step, token, user?.phone, projects.length]);

  // Picking a project fills the address in and, if the plot has a pin, asks
  // for the road distance from each seller's warehouse. One call per line,
  // all at once; a failure on one just leaves that line without a figure.
  function pickProject(projectId: string) {
    const picked = projects.find((p) => p.id === projectId);
    setForm((f) => ({
      ...f,
      projectId,
      deliveryAddress:
        picked && f.deliveryAddress.trim() === ""
          ? `${picked.address}, ${picked.areaName}`
          : f.deliveryAddress,
    }));
    setEstimates({});
    if (!token || !picked?.location?.lat || !picked.location.lng) return;
    setRouting(true);
    Promise.allSettled(
      cart.items.map(async (line) => [
        line.product.id,
        await estimateDelivery(token, line.product.id, projectId),
      ])
    )
      .then((results) => {
        const next: Record<string, DeliveryEstimate> = {};
        for (const r of results) {
          if (r.status === "fulfilled") {
            const [id, estimate] = r.value as [string, DeliveryEstimate];
            next[id] = estimate;
          }
        }
        setEstimates(next);
      })
      .finally(() => setRouting(false));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const orders = await checkout(token, {
        deliveryAddress: form.deliveryAddress,
        phone: form.phone,
        note: form.note || undefined,
        projectId: form.projectId || undefined,
      });
      setPlaced(orders);
      setStep("done");
      toast.success(`${orders.length} order${orders.length === 1 ? "" : "s"} placed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the orders");
    } finally {
      setBusy(false);
    }
  }

  const sellerCount = useMemo(
    () => new Set(cart.items.map((line) => line.product.seller.id)).size,
    [cart.items]
  );

  if (!isBuyer || !token) return null;

  const empty = cart.items.length === 0;

  return (
    <>
      {/* Backdrop fades with the panel so the two read as one surface arriving. */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-60 bg-stone-950/30 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-60 flex w-full max-w-md flex-col border-l border-white/50 bg-[#f7f4ee]/95 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-transform duration-500 ease-drawer dark:border-white/10 dark:bg-[#0a0f1d]/95 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            {step === "checkout" ? (
              <button
                type="button"
                onClick={() => setStep("cart")}
                aria-label="Back to cart"
                className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-900/5 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <h2 className="text-lg font-extrabold tracking-tight">
              {step === "cart" ? "Your cart" : step === "checkout" ? "Checkout" : "Orders placed"}
            </h2>
            {step === "cart" && cart.count > 0 && (
              <span
                key={cart.count}
                className="animate-check-pop rounded-full bg-amber-400 px-2 py-0.5 text-xs font-extrabold text-stone-950 tabular-nums"
              >
                {cart.count}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-900/5 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ---------- Step 1: the lines ---------- */}
        {step === "cart" && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {empty ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <span className="animate-float grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/15 text-amber-700 dark:text-amber-300">
                    <ShoppingBag className="h-7 w-7" />
                  </span>
                  <p className="mt-5 text-lg font-extrabold">Your cart is empty</p>
                  <p className="mt-1.5 max-w-xs text-sm text-stone-600 dark:text-slate-400">
                    Cement, steel, bricks and more, delivered to your site. Add anything from the
                    marketplace and it will wait for you here.
                  </p>
                  <Link
                    href="/marketplace"
                    onClick={close}
                    className="btn-primary mt-6 px-6 py-2.5 text-sm"
                  >
                    Browse materials
                    <ArrowRight className="btn-arrow h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-black/5 dark:divide-white/10">
                  {cart.items.map((line) => (
                    <LineItem
                      key={line.product.id}
                      line={line}
                      onQuantity={(next) => setQuantity(token, line.product.id, next)}
                      onRemove={() => remove(token, line.product.id)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {!empty && (
              <div className="border-t border-black/5 px-5 py-4 dark:border-white/10">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-stone-600 dark:text-slate-400">
                    Subtotal · {cart.count} item{cart.count === 1 ? "" : "s"}
                  </p>
                  <p className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                    <AnimatedNumber value={cart.subtotalBdt} format={formatBdt} />
                  </p>
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                  Delivery is arranged by each seller after they confirm. You pay per order once it
                  is placed.
                </p>
                <Button
                  block
                  size="lg"
                  magnetic
                  className="mt-4"
                  onClick={() => setStep("checkout")}
                >
                  Checkout
                  <ArrowRight className="btn-arrow h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => clear(token)}
                  className="btn-ghost mt-2 w-full px-4 py-2 text-xs"
                >
                  Clear cart
                </button>
              </div>
            )}
          </>
        )}

        {/* ---------- Step 2: checkout ---------- */}
        {step === "checkout" && (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-4">
                {projects.length > 0 && (
                  <div>
                    <label htmlFor="cart-project" className={labelClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Truck className="h-4 w-4" /> Delivering to which project?
                      </span>
                    </label>
                    <select
                      id="cart-project"
                      value={form.projectId}
                      onChange={(e) => pickProject(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Not for a specific project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}, {p.areaName}
                          {p.location?.lat ? "" : " (no map pin)"}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-500">
                      {routing
                        ? "Working out the road distance from each seller…"
                        : "Picking a pinned project fills the address in and shows how far each seller has to drive."}
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="cart-address" className={labelClass}>
                    Delivery address
                  </label>
                  <textarea
                    id="cart-address"
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
                  <label htmlFor="cart-phone" className={labelClass}>
                    Contact phone
                  </label>
                  <input
                    id="cart-phone"
                    type="tel"
                    required
                    minLength={6}
                    maxLength={30}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cart-note" className={labelClass}>
                    Note{" "}
                    <span className="font-medium text-stone-500 dark:text-slate-400">
                      (optional, goes to every seller)
                    </span>
                  </label>
                  <input
                    id="cart-note"
                    type="text"
                    maxLength={500}
                    placeholder="e.g. deliver before 5pm, call at the gate"
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                <div className="rounded-2xl border border-black/5 bg-white/50 dark:border-white/10 dark:bg-white/5">
                  <p className="border-b border-black/5 px-4 py-2.5 text-xs font-bold tracking-wider text-stone-500 uppercase dark:border-white/10 dark:text-slate-400">
                    Order summary
                  </p>
                  <ul className="divide-y divide-black/5 px-4 dark:divide-white/10">
                    {cart.items.map((line) => {
                      const est = estimates[line.product.id];
                      return (
                        <li key={line.product.id} className="py-2.5 text-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate">
                              <span className="font-semibold">{line.quantity}×</span>{" "}
                              {line.product.name}
                            </p>
                            <p className="shrink-0 font-bold tabular-nums">
                              {formatBdt(line.quantity * line.product.priceBdt)}
                            </p>
                          </div>
                          {est?.route && (
                            <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {est.route.distanceKm} km from{" "}
                              {line.product.seller.company || line.product.seller.name}, about{" "}
                              {est.route.durationMin} min
                            </p>
                          )}
                          {est?.unavailableReason && (
                            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-500">
                              {est.unavailableReason}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex items-baseline justify-between border-t border-black/5 px-4 py-3 dark:border-white/10">
                    <p className="text-sm font-semibold">
                      Total · {sellerCount} seller{sellerCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-lg font-extrabold text-amber-700 dark:text-amber-400">
                      {formatBdt(cart.subtotalBdt)}
                    </p>
                  </div>
                </div>

                {error && <Alert>{error}</Alert>}
              </div>
            </div>

            <div className="border-t border-black/5 px-5 py-4 dark:border-white/10">
              <Button type="submit" block size="lg" magnetic loading={busy} disabled={empty}>
                Place {cart.items.length === 1 ? "order" : `${cart.items.length} orders`} ·{" "}
                {formatBdt(cart.subtotalBdt)}
              </Button>
              <p className="mt-2 text-center text-xs text-stone-500 dark:text-slate-500">
                One order per product, so each seller can confirm and deliver on their own schedule.
              </p>
            </div>
          </form>
        )}

        {/* ---------- Step 3: done ---------- */}
        {step === "done" && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="animate-check-pop grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
              <DrawnCheck className="h-10 w-10" />
            </span>
            <h3 className="mt-6 text-2xl font-extrabold tracking-tight">
              {placed.length === 1 ? "Order placed" : `${placed.length} orders placed`}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-stone-600 dark:text-slate-400">
              {placed.length === 1 && placed[0]
                ? `${placed[0].seller.company || placed[0].seller.name} has been notified and will confirm a delivery date.`
                : "Every seller has been notified. Each will confirm a delivery date for their part."}
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <Link
                href="/marketplace/orders"
                onClick={close}
                className="btn-primary px-7 py-3 text-sm"
              >
                Track your orders
                <ArrowRight className="btn-arrow h-4 w-4" />
              </Link>
              <button type="button" onClick={close} className="btn-ghost px-6 py-2.5 text-sm">
                Keep shopping
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
