"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { DisputeScope, DisputeStatus, isDisputeLive, type Dispute } from "@buildora/shared";
import { listProjectDisputes, raiseDispute, withdrawDispute } from "@/lib/apiResolution";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { surfaceClass } from "@/components/ui/surface";

const cardClass = `${surfaceClass} p-5 sm:p-6`;
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const statusStyles: Record<DisputeStatus, string> = {
  [DisputeStatus.OPEN]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  [DisputeStatus.UNDER_REVIEW]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [DisputeStatus.RESOLVED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [DisputeStatus.WITHDRAWN]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

const scopeLabels: Record<DisputeScope, string> = {
  [DisputeScope.DESIGN_CONTRACT]: "Design contract",
  [DisputeScope.STRUCTURAL]: "Structural engagement",
  [DisputeScope.BUILD_MILESTONE]: "Construction milestone",
};

/**
 * Disputes over money held in escrow, from a party's side.
 *
 * The thing worth understanding here is the freeze: while one of these is live,
 * the escrow it concerns cannot be released, approved or cancelled by either
 * side. Only a supervisor's decision reopens it. That's what stops the dispute
 * from being decoration.
 */
export function DisputeSection({
  projectId,
  token,
  userId,
  /** What can be disputed right now, and what each one is called. */
  targets,
  onChanged,
}: {
  projectId: string;
  token: string;
  userId: string;
  targets: { scope: DisputeScope; id: string; label: string }[];
  onChanged: () => void;
}) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({ targetIndex: "0", reason: "", amountClaimedBdt: "" });

  const load = useCallback(async () => {
    try {
      setDisputes(await listProjectDisputes(token, projectId));
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  // Nothing filed and nothing disputable — don't invite trouble that isn't there.
  if (disputes.length === 0 && targets.length === 0) return null;

  const live = disputes.filter((d) => isDisputeLive(d.status));

  return (
    <section>
      <h2 className="display-title text-2xl">Disputes</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && <p className="mb-4 alert alert-danger">{error}</p>}

        {live.length > 0 && (
          <p className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
            <ShieldAlert className="mr-1.5 inline h-4 w-4" />
            Money under dispute is frozen, it can&apos;t be released or refunded until a Buildora
            supervisor decides.
          </p>
        )}

        {disputes.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-slate-400">
            If work is paid for but not delivered, or delivered but not paid, raise a dispute and a
            supervisor will review the evidence and decide where the escrowed money goes.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {disputes.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-stone-300/60 px-4 py-3 dark:border-white/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.targetLabel}</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-500">
                      {scopeLabels[d.scope]} · raised by {d.raisedBy.name} ·{" "}
                      {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[d.status]}`}
                  >
                    {d.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>

                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{d.reason}</p>
                {d.amountClaimedBdt != null && (
                  <p className="mt-1 text-sm font-semibold">
                    Claimed: {formatBdt(d.amountClaimedBdt)}
                  </p>
                )}

                {d.status === DisputeStatus.RESOLVED && (
                  <div className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
                    <p className="font-bold">
                      {d.refundBdt ? `${formatBdt(d.refundBdt)} refunded` : ""}
                      {d.refundBdt && d.releasedBdt ? " · " : ""}
                      {d.releasedBdt ? `${formatBdt(d.releasedBdt)} released` : ""}
                      {!d.refundBdt && !d.releasedBdt ? "No money moved" : ""}
                    </p>
                    {d.resolutionNote && (
                      <p className="mt-0.5 text-stone-600 dark:text-slate-400">
                        {d.resolutionNote}
                      </p>
                    )}
                  </div>
                )}

                {isDisputeLive(d.status) && d.raisedBy.id === userId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await withdrawDispute(token, d.id);
                        await load();
                        onChanged();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Couldn't withdraw it");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="mt-3 rounded-full btn-secondary px-5 py-2 text-sm disabled:opacity-60"
                  >
                    Withdraw and unfreeze
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {targets.length > 0 && !drafting && (
          <button
            type="button"
            onClick={() => setDrafting(true)}
            className="mt-4 rounded-full border border-rose-300 px-6 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
          >
            Raise a dispute
          </button>
        )}

        {drafting && (
          <div className="mt-4 flex flex-col gap-3 border-t border-stone-300/60 pt-4 dark:border-white/10">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">What is this about?</span>
              <select
                className={inputClass}
                value={form.targetIndex}
                onChange={(e) => setForm({ ...form, targetIndex: e.target.value })}
              >
                {targets.map((t, i) => (
                  <option key={t.id} value={String(i)}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className={inputClass}
              rows={4}
              placeholder="What went wrong, and what you want done about it. A supervisor reads this."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Amount in question (optional)</span>
              <input
                className={inputClass}
                type="number"
                value={form.amountClaimedBdt}
                onChange={(e) => setForm({ ...form, amountClaimedBdt: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || form.reason.trim().length < 20}
                onClick={async () => {
                  const target = targets[Number(form.targetIndex)];
                  if (!target) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await raiseDispute(token, {
                      scope: target.scope,
                      targetId: target.id,
                      reason: form.reason,
                      amountClaimedBdt: form.amountClaimedBdt
                        ? Number(form.amountClaimedBdt)
                        : undefined,
                    });
                    setForm({ targetIndex: "0", reason: "", amountClaimedBdt: "" });
                    setDrafting(false);
                    await load();
                    onChanged();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't raise it");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {busy ? "Filing…" : "Raise dispute"}
              </button>
              <button
                type="button"
                onClick={() => setDrafting(false)}
                className="rounded-full btn-secondary px-6 py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-500">
              Raising a dispute freezes the money it concerns until a supervisor decides. At least
              20 characters of explanation.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
