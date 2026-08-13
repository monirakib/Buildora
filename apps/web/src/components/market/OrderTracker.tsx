"use client";

import { CalendarClock, Check, MapPin, Truck } from "lucide-react";
import { OrderStatus, type MarketOrder } from "@buildora/shared";
import { statusLabels } from "./market";

/**
 * The buyer's view of where their order is.
 *
 * Deliberately a *timeline* rather than a single status chip: a chip says an
 * order is confirmed but never how long it has been sitting there, which is the
 * thing a buyer waiting on cement actually wants to know.
 *
 * The promised date comes from the seller at confirmation. That's the honest
 * unit of precision for a supplier with one pickup truck — they can commit to a
 * day, not to a moving marker on a map.
 */

/** The happy path, in order. Cancelled is drawn separately — it's an exit. */
const JOURNEY: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayOnly(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function OrderTracker({ order }: { order: MarketOrder }) {
  const cancelled = order.status === OrderStatus.CANCELLED;
  // An event may exist for a step even after a later one — the timeline is the
  // record, so each step reads its own entry rather than being inferred.
  const eventFor = (s: OrderStatus) => order.timeline.find((e) => e.status === s);

  const expected = order.expectedDeliveryAt;
  const late =
    expected &&
    order.status !== OrderStatus.DELIVERED &&
    !cancelled &&
    new Date(expected).getTime() < Date.now();

  return (
    <div className="rounded-xl border border-stone-300/60 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">
      {/* The promise, and the distance behind it */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {expected && (
          <p className="inline-flex items-center gap-1.5 text-sm">
            <CalendarClock
              className={`h-4 w-4 ${late ? "text-rose-500" : "text-stone-500 dark:text-slate-500"}`}
            />
            <span className="text-stone-600 dark:text-slate-400">
              {order.status === OrderStatus.DELIVERED ? "Was due" : "Expected"}
            </span>
            <span className={`font-bold ${late ? "text-rose-600 dark:text-rose-400" : ""}`}>
              {dayOnly(expected)}
            </span>
            {late && <span className="text-xs font-bold text-rose-600">overdue</span>}
          </p>
        )}
        {order.deliveryDistanceKm != null && (
          <p className="inline-flex items-center gap-1.5 text-sm text-stone-600 dark:text-slate-400">
            <MapPin className="h-4 w-4" />
            {order.deliveryDistanceKm} km
            {order.deliveryDurationMin != null && ` · ~${order.deliveryDurationMin} min drive`}
          </p>
        )}
      </div>

      {/* The journey */}
      <ol className="mt-4 flex flex-col gap-0">
        {JOURNEY.map((step, i) => {
          const event = eventFor(step);
          const done = !!event;
          const isLast = i === JOURNEY.length - 1;
          return (
            <li key={step} className="flex gap-3">
              {/* Marker + connector */}
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                    done
                      ? "bg-emerald-500 text-white"
                      : "border border-stone-300 dark:border-white/20"
                  }`}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : step === OrderStatus.DISPATCHED ? (
                    <Truck className="h-3 w-3 text-stone-400" />
                  ) : null}
                </span>
                {!isLast && (
                  <span
                    className={`w-0.5 flex-1 ${
                      done ? "bg-emerald-500/40" : "bg-stone-300/60 dark:bg-white/10"
                    }`}
                    style={{ minHeight: "1.25rem" }}
                  />
                )}
              </div>

              {/* Label */}
              <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                <p
                  className={`text-sm font-semibold ${
                    done ? "" : "text-stone-500 dark:text-slate-500"
                  }`}
                >
                  {statusLabels[step]}
                </p>
                {event && (
                  <p className="text-xs text-stone-500 dark:text-slate-500">{when(event.at)}</p>
                )}
                {event?.note && (
                  <p className="mt-0.5 text-xs text-stone-600 dark:text-slate-400">{event.note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {cancelled && (
        <p className="mt-1 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
          Cancelled
          {eventFor(OrderStatus.CANCELLED) && ` on ${when(eventFor(OrderStatus.CANCELLED)!.at)}`}
          {eventFor(OrderStatus.CANCELLED)?.note
            ? `, ${eventFor(OrderStatus.CANCELLED)!.note}`
            : ""}
        </p>
      )}
    </div>
  );
}
