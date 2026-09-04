"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DisputeResolution,
  DisputeStatus,
  UserRole,
  isDisputeLive,
  type Dispute,
} from "@buildora/shared";
import { listDisputes, resolveDispute } from "@/lib/apiResolution";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { surfaceClass } from "@/components/ui/surface";
import { ListSkeleton } from "@/components/ui/Skeleton";

const cardClass = surfaceClass;
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const TABS = [
  { status: "", label: "Needs a decision" },
  { status: DisputeStatus.RESOLVED, label: "Resolved" },
  { status: DisputeStatus.WITHDRAWN, label: "Withdrawn" },
] as const;

/** Each outcome, with the plain-English consequence spelled out. */
const RESOLUTIONS: { value: DisputeResolution; label: string; effect: string }[] = [
  {
    value: DisputeResolution.RELEASE_TO_PROFESSIONAL,
    label: "Professional was right",
    effect: "Everything held is released to them.",
  },
  {
    value: DisputeResolution.REFUND_TO_CLIENT,
    label: "Client was right",
    effect: "Everything held goes back to the client.",
  },
  {
    value: DisputeResolution.SPLIT,
    label: "Split it",
    effect: "You choose how much returns to the client; the rest is released.",
  },
  {
    value: DisputeResolution.NO_ACTION,
    label: "No money moves",
    effect: "Closed without touching the escrow.",
  },
];

/**
 * The supervisor's dispute queue.
 *
 * This is the only screen in the platform where escrow moves on a third party's
 * say-so, which is why every option states its consequence before you pick it,
 * and why the decision note is mandatory — both sides are shown it.
 */
export default function AdminDisputesPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [tab, setTab] = useState<string>("");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState<DisputeResolution>(
    DisputeResolution.RELEASE_TO_PROFESSIONAL
  );
  const [note, setNote] = useState("");
  const [refundBdt, setRefundBdt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/auth");
    else if (user.role !== UserRole.ADMIN) router.replace("/dashboard");
  }, [mounted, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setDisputes(await listDisputes(token, tab || undefined));
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    if (mounted && user?.role === UserRole.ADMIN) load();
  }, [mounted, user, load]);

  if (!mounted || !user || user.role !== UserRole.ADMIN || !token) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500 loading-dots">
            Loading
          </p>
        </main>
      </div>
    );
  }

  async function decide() {
    if (!selected || !token) return;
    setBusy(true);
    setError(null);
    try {
      await resolveDispute(token, selected.id, {
        resolution,
        note,
        refundBdt: resolution === DisputeResolution.SPLIT ? Number(refundBdt || 0) : undefined,
      });
      setSelected(null);
      setNote("");
      setRefundBdt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="animate-rise-in text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400">
            Supervisor
          </p>
          <h1 className="display-title animate-rise-in [animation-delay:70ms] mt-2 text-4xl sm:text-5xl">
            Disputes
          </h1>
          <p className="animate-rise-in [animation-delay:140ms] mt-3 max-w-xl text-stone-600 dark:text-slate-400">
            Money held in escrow that two people disagree about. It stays frozen until you decide.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setTab(t.status);
                  setSelected(null);
                }}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  tab === t.status
                    ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
                    : "border border-stone-300/80 bg-white/50 text-stone-600 backdrop-blur hover:text-stone-900 dark:border-white/15 dark:bg-white/5 dark:text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {loading ? (
              <ListSkeleton rows={3} />
            ) : disputes.length === 0 ? (
              <div className={`${cardClass} p-6 text-sm text-stone-600 dark:text-slate-400`}>
                Nothing here.
              </div>
            ) : (
              disputes.map((d) => (
                <div key={d.id} className={`${cardClass} p-5 sm:p-6`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{d.targetLabel}</p>
                      <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                        <Link
                          href={`/projects/${d.projectId}`}
                          className="text-amber-700 underline underline-offset-2 dark:text-amber-400"
                        >
                          {d.projectTitle}
                        </Link>{" "}
                        · {d.raisedBy.name} vs {d.against.name} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    {d.amountClaimedBdt != null && (
                      <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-700 dark:text-amber-300">
                        {formatBdt(d.amountClaimedBdt)} claimed
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                    {d.reason}
                  </p>

                  {d.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d.evidence.map((e, i) => (
                        <a
                          key={i}
                          href={e.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-stone-300/60 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-white/15 dark:text-amber-400"
                        >
                          {e.caption}
                        </a>
                      ))}
                    </div>
                  )}

                  {d.status === DisputeStatus.RESOLVED && (
                    <div className="mt-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm">
                      <p className="font-bold">
                        {d.resolution?.replace(/_/g, " ").toLowerCase()},{" "}
                        {d.refundBdt ? `${formatBdt(d.refundBdt)} refunded` : ""}
                        {d.refundBdt && d.releasedBdt ? ", " : ""}
                        {d.releasedBdt ? `${formatBdt(d.releasedBdt)} released` : ""}
                        {!d.refundBdt && !d.releasedBdt ? "no money moved" : ""}
                      </p>
                      {d.resolutionNote && <p className="mt-1">{d.resolutionNote}</p>}
                      {d.resolvedBy && (
                        <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                          by {d.resolvedBy.name}
                          {d.resolvedAt ? ` on ${formatDate(d.resolvedAt)}` : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {isDisputeLive(d.status) &&
                    (selected?.id === d.id ? (
                      <div className="mt-4 flex flex-col gap-3 border-t border-stone-300/60 pt-4 dark:border-white/10">
                        <div className="flex flex-col gap-2">
                          {RESOLUTIONS.map((r) => (
                            <label
                              key={r.value}
                              className="flex items-start gap-2.5 text-sm font-medium"
                            >
                              <input
                                type="radio"
                                name={`res-${d.id}`}
                                checked={resolution === r.value}
                                onChange={() => setResolution(r.value)}
                                className="mt-0.5 h-4 w-4 accent-amber-500"
                              />
                              <span>
                                {r.label}
                                <span className="block text-xs text-stone-500 dark:text-slate-500">
                                  {r.effect}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>

                        {resolution === DisputeResolution.SPLIT && (
                          <label className="text-sm">
                            <span className="mb-1 block font-semibold">
                              Refund to the client (BDT)
                            </span>
                            <input
                              className={inputClass}
                              type="number"
                              value={refundBdt}
                              onChange={(e) => setRefundBdt(e.target.value)}
                            />
                          </label>
                        )}

                        <textarea
                          className={inputClass}
                          rows={3}
                          placeholder="Why you decided this. Both sides see it."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />

                        {error && <p className="alert alert-danger">{error}</p>}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy || note.trim().length < 10}
                            onClick={decide}
                            className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {busy ? "Saving…" : "Resolve and move the money"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelected(null)}
                            className="rounded-full btn-secondary px-6 py-2.5 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(d);
                          setError(null);
                        }}
                        className="mt-4 rounded-full btn-primary px-6 py-2.5 text-sm"
                      >
                        Decide this
                      </button>
                    ))}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
