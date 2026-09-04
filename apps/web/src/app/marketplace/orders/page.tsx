"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus, PaymentPurpose, UserRole, type MarketOrder } from "@buildora/shared";
import { listOrders, updateOrderStatus } from "@/lib/apiMarket";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { PackageOpen } from "lucide-react";
import { formatDate } from "@/components/app/projectStatus";
import { formatBdt, statusLabels, statusStyles } from "@/components/market/market";
import { OrderTracker } from "@/components/market/OrderTracker";
import { GatewayPayButton } from "@/components/app/GatewayPayButton";
import { readPaymentNotice } from "@/lib/apiPayments";
import { surfaceClass } from "@/components/ui/surface";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

/** Tomorrow — the usual answer, and one tap away from anything else. */
function defaultDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Marketplace orders — buyers track what they ordered; sellers fulfil. */
export default function MarketOrdersPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Set once on mount from the ?payment=… flag the gateway callback adds.
  const [notice, setNotice] = useState<ReturnType<typeof readPaymentNotice>>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setNotice(readPaymentNotice());
  }, []);

  const isBuyer = user?.role === UserRole.LAND_OWNER;
  const isSeller = user?.role === UserRole.SUPPLIER || user?.role === UserRole.CONTRACTOR;

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (!token || (!isBuyer && !isSeller)) return;
    (async () => {
      try {
        setOrders(await listOrders(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load orders");
      } finally {
        setLoading(false);
      }
    })();
  }, [mounted, user, token, isBuyer, isSeller, router]);

  // Which order is mid-confirmation, and the promise being typed for it.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmForm, setConfirmForm] = useState({ date: defaultDeliveryDate(), note: "" });

  /**
   * Confirming is the one move that carries a promise, so it opens the date
   * form instead of firing straight away. Everything else moves immediately.
   */
  async function move(order: MarketOrder, status: OrderStatus) {
    if (!token) return;
    if (status === OrderStatus.CONFIRMED) {
      setConfirming(order.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(token, order.id, status);
      setOrders((list) => list.map((o) => (o.id === order.id ? updated : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the order");
    } finally {
      setBusy(false);
    }
  }

  /** Confirms with the delivery date the seller just promised. */
  async function confirmWithDate(order: MarketOrder) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(token, order.id, OrderStatus.CONFIRMED, {
        expectedDeliveryAt: new Date(`${confirmForm.date}T12:00:00`).toISOString(),
        note: confirmForm.note || undefined,
      });
      setOrders((list) => list.map((o) => (o.id === order.id ? updated : o)));
      setConfirming(null);
      setConfirmForm({ date: defaultDeliveryDate(), note: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm the order");
    } finally {
      setBusy(false);
    }
  }

  // Which buttons each side sees for a given order state.
  function actionsFor(order: MarketOrder): { label: string; to: OrderStatus; danger?: boolean }[] {
    if (isSeller) {
      if (order.status === OrderStatus.PLACED)
        return [
          { label: "Confirm", to: OrderStatus.CONFIRMED },
          { label: "Cancel", to: OrderStatus.CANCELLED, danger: true },
        ];
      if (order.status === OrderStatus.CONFIRMED)
        return [
          { label: "Dispatch", to: OrderStatus.DISPATCHED },
          { label: "Mark delivered", to: OrderStatus.DELIVERED },
          { label: "Cancel", to: OrderStatus.CANCELLED, danger: true },
        ];
      // Once it's on the road the only honest move left is delivered.
      if (order.status === OrderStatus.DISPATCHED)
        return [{ label: "Mark delivered", to: OrderStatus.DELIVERED }];
      return [];
    }
    // Buyers can back out while the order is still just placed.
    return order.status === OrderStatus.PLACED
      ? [{ label: "Cancel order", to: OrderStatus.CANCELLED, danger: true }]
      : [];
  }

  if (!mounted || !user || (!isBuyer && !isSeller)) {
    return (
      <main className="grid min-h-screen place-items-center">
        <ListSkeleton rows={3} />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <PageHeader
            back={{ href: "/marketplace", label: "Marketplace" }}
            eyebrow="Marketplace"
            title={isSeller ? "Incoming orders" : "Your orders"}
            description={
              isSeller
                ? "Confirm, deliver, or cancel orders placed on your listings."
                : "Everything you've ordered from the marketplace, newest first."
            }
          />

          {notice && (
            <p
              className={`mt-6 rounded-xl px-4 py-2.5 text-sm font-medium ${
                notice.tone === "success"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300"
              }`}
            >
              {notice.message}
            </p>
          )}

          {error && <p className="mt-6 alert alert-danger">{error}</p>}

          {loading ? (
            <ListSkeleton rows={3} className="mt-8" />
          ) : orders.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={<PackageOpen className="h-7 w-7" />}
              title="No orders yet"
              description={
                isSeller
                  ? "Orders on your listings will appear here the moment a buyer places one."
                  : "Add materials to your cart from the marketplace and check out to see them here."
              }
              action={
                isSeller ? undefined : (
                  <Link href="/marketplace" className="btn-primary px-6 py-2.5 text-sm">
                    Browse the marketplace
                  </Link>
                )
              }
            />
          ) : (
            <ul className="mt-8 flex flex-col gap-4">
              {orders.map((o) => (
                <li key={o.id} className={` animate-rise-in`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {o.product.name}
                        {o.product.brand ? (
                          <span className="font-medium text-stone-500 dark:text-slate-400">
                            {" "}
                            · {o.product.brand}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                        {o.quantity} {o.product.unit} × {formatBdt(o.product.priceBdt)} ={" "}
                        <span className="font-bold text-stone-900 dark:text-slate-100">
                          {formatBdt(o.totalBdt)}
                        </span>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[o.status]}`}
                    >
                      {statusLabels[o.status]}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-stone-600 sm:grid-cols-2 dark:text-slate-400">
                    <p>
                      {isSeller ? (
                        <>
                          Buyer: <span className="font-semibold">{o.buyer.name}</span> · {o.phone}
                        </>
                      ) : (
                        <>
                          Seller:{" "}
                          <span className="font-semibold">{o.seller.company || o.seller.name}</span>
                        </>
                      )}
                    </p>
                    <p>Ordered {formatDate(o.createdAt)}</p>
                    <p>
                      {o.paidAt ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          Paid {formatDate(o.paidAt)}
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Payment pending
                        </span>
                      )}
                    </p>
                    <p className="sm:col-span-2">Deliver to: {o.deliveryAddress}</p>
                    {o.note && <p className="sm:col-span-2">Note: {o.note}</p>}
                  </div>

                  {/* Where the order actually is, for both sides. */}
                  <div className="mt-4">
                    <OrderTracker order={o} />
                  </div>

                  {/* Confirming asks for the date before it fires, because that
                      date is a promise the buyer will hold them to. */}
                  {confirming === o.id && (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
                      <p className="text-sm font-bold">When will you deliver?</p>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-sm">
                          <span className="mb-1 block font-semibold">Delivery date</span>
                          <input
                            type="date"
                            value={confirmForm.date}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(e) =>
                              setConfirmForm((f) => ({ ...f, date: e.target.value }))
                            }
                            className="block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10"
                          />
                        </label>
                        <label className="min-w-48 flex-1 text-sm">
                          <span className="mb-1 block font-semibold">
                            Note{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. Truck leaves at 7am"
                            value={confirmForm.note}
                            onChange={(e) =>
                              setConfirmForm((f) => ({ ...f, note: e.target.value }))
                            }
                            className="block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10"
                          />
                        </label>
                      </div>
                      {o.deliveryDurationMin != null && (
                        <p className="text-xs text-stone-600 dark:text-slate-400">
                          It&apos;s a {o.deliveryDistanceKm} km run, about {o.deliveryDurationMin}{" "}
                          minutes each way.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !confirmForm.date}
                          onClick={() => confirmWithDate(o)}
                          className="rounded-full btn-primary px-6 py-2.5 text-sm disabled:opacity-60"
                        >
                          {busy ? "Confirming…" : "Confirm order"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="rounded-full btn-secondary px-6 py-2.5 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Buyers pay for an order that hasn't been settled yet. */}
                  {isBuyer && !o.paidAt && o.status !== OrderStatus.CANCELLED && token && (
                    <div className="mt-4">
                      <GatewayPayButton
                        token={token}
                        purpose={PaymentPurpose.MARKET_ORDER}
                        refId={o.id}
                        amountBdt={o.totalBdt}
                        label={`Pay ${formatBdt(o.totalBdt)}`}
                      />
                    </div>
                  )}

                  {actionsFor(o).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {actionsFor(o).map((a) => (
                        <button
                          key={a.to}
                          type="button"
                          disabled={busy}
                          onClick={() => move(o, a.to)}
                          className={`rounded-full px-5 py-2 text-xs font-bold transition disabled:opacity-60 ${
                            a.danger
                              ? "border border-rose-300/60 text-rose-600 hover:bg-rose-500/10 dark:border-rose-400/30 dark:text-rose-400"
                              : "bg-amber-400 text-stone-950 hover:bg-amber-300"
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
