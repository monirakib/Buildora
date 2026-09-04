"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { TenderStatus, UserRole, type Tender } from "@buildora/shared";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { Navbar } from "@/components/landing/Navbar";
import { getTender, submitBid } from "@/lib/apiTenders";
import { useSession } from "@/store/useSession";
import { useRegisterAiContext } from "@/lib/useRegisterAiContext";
import { BidSanityPanel } from "@/components/project/BidSanityPanel";
import { VerifyNotice, useIsVerified } from "@/components/app/VerifyGate";
import { surfaceClass } from "@/components/ui/surface";
import { ListSkeleton } from "@/components/ui/Skeleton";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

/**
 * One tender, as a contractor sees it: the scope, the Bill of Quantities with
 * quantities but no prices, and a form to put a rate against every line.
 *
 * The running total is computed here purely so the bidder can see what they're
 * quoting. The server recomputes it from its own quantities — nothing sent from
 * this page decides what the bid is worth.
 */
export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const isVerified = useIsVerified();

  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRegisterAiContext(
    tender ? { page: "tender", label: tender.title, tenderId: tender.id } : null
  );
  const [done, setDone] = useState(false);

  const [rates, setRates] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState({ timelineWeeks: "", validityDays: "30", coverLetter: "" });

  useEffect(() => {
    if (!token || !user) {
      router.push("/auth");
      return;
    }
    (async () => {
      try {
        const result = await getTender(token, params.id);
        setTender(result.tender);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load this tender");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user, params.id, router]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !tender) return;
    setBusy(true);
    setError(null);
    try {
      await submitBid(token, tender.id, {
        lines: tender.items.map((item) => ({
          itemId: item.id,
          ratePerUnitBdt: Number(rates[item.id] ?? 0),
        })),
        timelineWeeks: Number(meta.timelineWeeks),
        validityDays: Number(meta.validityDays),
        coverLetter: meta.coverLetter.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the bid");
    } finally {
      setBusy(false);
    }
  }

  const total = tender
    ? tender.items.reduce((sum, i) => sum + i.quantity * Number(rates[i.id] ?? 0), 0)
    : 0;
  const allPriced = tender
    ? tender.items.every((i) => rates[i.id] !== undefined && rates[i.id] !== "")
    : false;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pt-28 pb-20 sm:px-6">
        <Link
          href="/tenders"
          className="text-sm font-semibold text-stone-600 hover:text-amber-700 dark:text-slate-400"
        >
          ← All tenders
        </Link>

        {loading ? (
          <ListSkeleton rows={3} className="mt-6" />
        ) : !tender ? (
          <p className="mt-6 alert alert-danger">{error ?? "Tender not found"}</p>
        ) : (
          <>
            <h1 className="display-title animate-rise-in [animation-delay:70ms] mt-4 text-4xl">
              {tender.title}
            </h1>
            <p className="mt-2 text-sm text-stone-500 dark:text-slate-500">
              {tender.projectTitle} · posted by {tender.owner.name} · closes{" "}
              {formatDate(tender.deadlineAt)}
              {tender.siteVisitAt ? ` · site visit ${formatDate(tender.siteVisitAt)}` : ""}
            </p>

            <div className={`mt-6 ${cardClass}`}>
              <p className="text-sm font-bold">Scope of work</p>
              <p className="mt-2 text-sm whitespace-pre-wrap text-stone-700 dark:text-slate-300">
                {tender.scope}
              </p>
            </div>

            {error && <p className="mt-6 alert alert-danger">{error}</p>}

            {done ? (
              <div className={`mt-6 ${cardClass}`}>
                <p className="flex items-center gap-2 font-bold">
                  <Lock className="h-4 w-4" />
                  Bid sealed and submitted
                </p>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  {formatBdt(total)} over {meta.timelineWeeks} weeks. Nobody, including the owner,
                  can read it until bidding closes on {formatDate(tender.deadlineAt)}. You can
                  revise it any time before then.
                </p>
                <Link
                  href="/tenders"
                  className="mt-4 inline-block rounded-full btn-primary px-5 py-2 text-xs"
                >
                  Back to tenders
                </Link>
              </div>
            ) : user?.role !== UserRole.CONTRACTOR ? (
              <p className="mt-6 rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                Only contractors can bid on a tender.
              </p>
            ) : tender.status !== TenderStatus.OPEN ? (
              <p className="mt-6 rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                Bidding has closed on this tender.
              </p>
            ) : !isVerified ? (
              // The BOQ above stays visible — a contractor should be able to
              // read the job and decide it's worth getting verified for.
              <VerifyNotice action="bid on tenders" className="mt-6" />
            ) : (
              <form onSubmit={send} className={`mt-6 ${cardClass}`}>
                <p className="text-sm font-bold">Bill of Quantities</p>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                  Put a rate against every line. Every line must be priced, a partial bid can&apos;t
                  be compared fairly against a complete one.
                </p>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-black/10 text-left text-xs text-stone-500 dark:border-white/10 dark:text-slate-500">
                        <th className="pb-2 font-semibold">Description</th>
                        <th className="pb-2 font-semibold">Qty</th>
                        <th className="pb-2 font-semibold">Unit</th>
                        <th className="pb-2 font-semibold">Your rate (BDT)</th>
                        <th className="pb-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tender.items.map((item) => {
                        const rate = Number(rates[item.id] ?? 0);
                        return (
                          <tr key={item.id} className="border-b border-black/5 dark:border-white/5">
                            <td className="py-2 pr-3">{item.description}</td>
                            <td className="py-2 pr-3 text-stone-500 dark:text-slate-500">
                              {item.quantity.toLocaleString()}
                            </td>
                            <td className="py-2 pr-3 text-stone-500 dark:text-slate-500">
                              {item.unit}
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                required
                                value={rates[item.id] ?? ""}
                                onChange={(e) =>
                                  setRates((r) => ({ ...r, [item.id]: e.target.value }))
                                }
                                className={`${inputClass} w-32`}
                              />
                            </td>
                            <td className="py-2 text-right font-semibold">
                              {rate > 0 ? formatBdt(Math.round(rate * item.quantity)) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td colSpan={4} className="pt-3 text-right font-bold">
                          Your bid
                        </td>
                        <td className="pt-3 text-right text-lg font-extrabold">
                          {formatBdt(Math.round(total))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                      How many weeks to build?
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={520}
                      required
                      value={meta.timelineWeeks}
                      onChange={(e) => setMeta((m) => ({ ...m, timelineWeeks: e.target.value }))}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                      Price valid for (days)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      required
                      value={meta.validityDays}
                      onChange={(e) => setMeta((m) => ({ ...m, validityDays: e.target.value }))}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                    Cover letter (optional)
                  </span>
                  <textarea
                    rows={3}
                    value={meta.coverLetter}
                    onChange={(e) => setMeta((m) => ({ ...m, coverLetter: e.target.value }))}
                    placeholder="Similar work you've done, your crew size, anything the owner should know."
                    className={`${inputClass} mt-1`}
                  />
                </label>

                {/*
                  A private look at their own rates before the bid is sealed.
                  Runs only when pressed, and never reveals a benchmark figure —
                  see BidSanityPanel for why that matters here.
                */}
                {token && (
                  <div className="mt-4">
                    <BidSanityPanel
                      token={token}
                      tenderId={tender.id}
                      lines={tender.items.map((item) => ({
                        itemId: item.id,
                        ratePerUnitBdt: Number(rates[item.id] ?? 0),
                      }))}
                      timelineWeeks={Number(meta.timelineWeeks) || undefined}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !allPriced}
                  className="mt-4 rounded-full btn-primary px-6 py-2.5 text-sm disabled:opacity-60"
                >
                  {busy ? "Sealing…" : "Submit sealed bid"}
                </button>
                {!allPriced && (
                  <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                    Price every line to submit.
                  </p>
                )}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
