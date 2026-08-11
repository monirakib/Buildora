"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus, PaymentPurpose, UserRole, type MarketOrder } from "@buildora/shared";
import { listOrders, updateOrderStatus } from "@/lib/apiMarket";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { formatDate } from "@/components/app/projectStatus";
import { formatBdt, statusLabels, statusStyles } from "@/components/market/market";
import { GatewayPayButton } from "@/components/app/GatewayPayButton";
import { readPaymentNotice } from "@/lib/apiPayments";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

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

  async function move(order: MarketOrder, status: OrderStatus) {
    if (!token) return;
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
          { label: "Mark delivered", to: OrderStatus.DELIVERED },
          { label: "Cancel", to: OrderStatus.CANCELLED, danger: true },
        ];
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
            className="text-sm font-semibold text-stone-500 transition hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
          >
            ← Marketplace
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {isSeller ? "Incoming orders" : "Your orders"}
          </h1>
          <p className="mt-2 text-stone-600 dark:text-slate-400">
            {isSeller
              ? "Confirm, deliver, or cancel orders placed on your listings."
              : "Everything you've ordered from the marketplace, newest first."}
          </p>

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

          {error && (
            <p className="mt-6 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </p>
          )}

          {loading ? (
            <p className="mt-8 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : orders.length === 0 ? (
            <div className={`mt-8 text-center ${cardClass}`}>
              <p className="font-bold">No orders yet</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                {isSeller ? (
                  "Orders on your listings will appear here."
                ) : (
                  <>
                    Browse the{" "}
                    <Link
                      href="/marketplace"
                      className="text-amber-600 underline underline-offset-2 dark:text-amber-400"
                    >
                      marketplace
                    </Link>{" "}
                    and order materials for your site.
                  </>
                )}
              </p>
            </div>
          ) : (
            <ul className="mt-8 flex flex-col gap-4">
              {orders.map((o) => (
                <li key={o.id} className={cardClass}>
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
                          <span className="font-semibold">
                            {o.seller.company || o.seller.name}
                          </span>
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
