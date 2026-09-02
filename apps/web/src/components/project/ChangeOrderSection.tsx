"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { ChangeOrderStatus, type ChangeOrder } from "@buildora/shared";
import {
  decideChangeOrder,
  listChangeOrders,
  proposeChangeOrder,
  withdrawChangeOrder,
} from "@/lib/apiResolution";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { surfaceClass } from "@/components/ui/surface";

const cardClass = `${surfaceClass} p-5 sm:p-6`;
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

const statusStyles: Record<ChangeOrderStatus, string> = {
  [ChangeOrderStatus.PROPOSED]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [ChangeOrderStatus.APPROVED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [ChangeOrderStatus.REJECTED]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  [ChangeOrderStatus.WITHDRAWN]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

/**
 * Variations on a live build contract.
 *
 * The contractor proposes (they're the ones who find the soft ground), the
 * owner decides. Approving moves the contract sum and, when the change costs
 * money, appends a milestone — so the variation is funded and inspected through
 * the same machinery as the original scope rather than a second payment path.
 */
export function ChangeOrderSection({
  buildContractId,
  token,
  isOwner,
  isContractor,
  onChanged,
}: {
  buildContractId: string;
  token: string;
  isOwner: boolean;
  isContractor: boolean;
  onChanged: () => void;
}) {
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    amountDeltaBdt: "",
    timelineDeltaWeeks: "0",
  });

  const load = useCallback(async () => {
    try {
      setOrders(await listChangeOrders(token, buildContractId));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token, buildContractId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  // Nothing to say to someone who can neither raise nor decide one.
  if (orders.length === 0 && !isContractor) return null;

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Variations</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {orders.length === 0 && !drafting && (
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Work nobody priced at tender time, a deeper foundation, an upgraded finish. Proposing
            one here keeps the change inside escrow instead of becoming a side deal.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const positive = order.amountDeltaBdt >= 0;
            return (
              <li
                key={order.id}
                className="rounded-xl border border-stone-300/60 px-4 py-3 dark:border-white/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{order.title}</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-500">
                      {order.raisedBy.name} · {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[order.status]}`}
                  >
                    {order.status.toLowerCase()}
                  </span>
                </div>

                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  {order.description}
                </p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span
                    className={
                      positive
                        ? "font-bold text-rose-600 dark:text-rose-400"
                        : "font-bold text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {positive ? "+" : "−"}
                    {formatBdt(Math.abs(order.amountDeltaBdt))}
                  </span>
                  {order.timelineDeltaWeeks !== 0 && (
                    <span className="text-stone-600 dark:text-slate-400">
                      {order.timelineDeltaWeeks > 0 ? "+" : ""}
                      {order.timelineDeltaWeeks} weeks
                    </span>
                  )}
                </div>

                {order.decisionNote && (
                  <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                    Note: {order.decisionNote}
                  </p>
                )}

                {order.status === ChangeOrderStatus.PROPOSED && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => decideChangeOrder(token, order.id, "approve"))}
                          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => decideChangeOrder(token, order.id, "reject"))}
                          className="rounded-full border border-rose-300 px-5 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {isContractor && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => withdrawChangeOrder(token, order.id))}
                        className="rounded-full border border-stone-300 px-5 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isContractor && !drafting && (
          <button
            type="button"
            onClick={() => setDrafting(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
          >
            <FilePlus2 className="h-4 w-4" /> Propose a variation
          </button>
        )}

        {drafting && (
          <div className="mt-4 flex flex-col gap-3 border-t border-stone-300/60 pt-4 dark:border-white/10">
            <input
              className={inputClass}
              placeholder="Title, e.g. Deeper piling to rock"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              className={inputClass}
              rows={3}
              placeholder="What the work is, and why it's needed. The owner reads this before deciding."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Cost change (BDT)</span>
                <input
                  className={inputClass}
                  type="number"
                  placeholder="Negative if work is removed"
                  value={form.amountDeltaBdt}
                  onChange={(e) => setForm({ ...form, amountDeltaBdt: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Programme change (weeks)</span>
                <input
                  className={inputClass}
                  type="number"
                  value={form.timelineDeltaWeeks}
                  onChange={(e) => setForm({ ...form, timelineDeltaWeeks: e.target.value })}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !form.title || !form.description}
                onClick={() =>
                  run(async () => {
                    await proposeChangeOrder(token, buildContractId, {
                      title: form.title,
                      description: form.description,
                      amountDeltaBdt: Number(form.amountDeltaBdt || 0),
                      timelineDeltaWeeks: Number(form.timelineDeltaWeeks || 0),
                    });
                    setForm({
                      title: "",
                      description: "",
                      amountDeltaBdt: "",
                      timelineDeltaWeeks: "0",
                    });
                    setDrafting(false);
                  })
                }
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send to owner"}
              </button>
              <button
                type="button"
                onClick={() => setDrafting(false)}
                className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
