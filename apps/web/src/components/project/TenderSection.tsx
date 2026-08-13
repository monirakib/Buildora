"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import {
  BidStatus,
  TenderStatus,
  type Bid,
  type BidComparison,
  type Project,
  type Tender,
} from "@buildora/shared";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import {
  awardBid,
  cancelTender,
  closeTender,
  createTender,
  getBoqTemplate,
  getProjectTender,
  listTenderBids,
  publishTender,
  shortlistBid,
  updateTender,
  type BoqTemplateItem,
  type TenderInput,
} from "@/lib/apiTenders";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const statusStyles: Record<TenderStatus, string> = {
  [TenderStatus.DRAFT]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
  [TenderStatus.OPEN]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [TenderStatus.CLOSED]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [TenderStatus.AWARDED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [TenderStatus.CANCELLED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

const statusLabels: Record<TenderStatus, string> = {
  [TenderStatus.DRAFT]: "Draft",
  [TenderStatus.OPEN]: "Open for bids",
  [TenderStatus.CLOSED]: "Bidding closed",
  [TenderStatus.AWARDED]: "Awarded",
  [TenderStatus.CANCELLED]: "Cancelled",
};

/** A BOQ line while the owner is editing it — quantities as typed strings. */
interface DraftItem {
  description: string;
  unit: string;
  quantity: string;
  guideRateBdt: string;
}

function toDraft(item: BoqTemplateItem): DraftItem {
  return {
    description: item.description,
    unit: item.unit,
    quantity: String(item.quantity),
    guideRateBdt: String(item.guideRateBdt),
  };
}

/** "in 3 days" / "2 hours left", for a bidding deadline. */
function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "closed";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

/**
 * Contractor tendering, from the owner's side.
 *
 * Three faces depending on where the tender is: the drafting table (pre-filled
 * from the floor plan), the sealed waiting room while contractors price it, and
 * the comparison once bidding closes.
 */
export function TenderSection({
  project,
  token,
  isOwner,
  onChanged,
}: {
  project: Project;
  token: string;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({ title: "", scope: "", deadlineAt: "", siteVisitAt: "" });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [builtArea, setBuiltArea] = useState<number | null>(null);

  const [bids, setBids] = useState<Bid[]>([]);
  const [comparison, setComparison] = useState<BidComparison | null>(null);

  const load = useCallback(async () => {
    try {
      const found = await getProjectTender(token, project.id);
      setTender(found);
      // Bids only become readable once bidding closes; the API refuses before.
      if (
        found &&
        isOwner &&
        (found.status === TenderStatus.CLOSED || found.status === TenderStatus.AWARDED)
      ) {
        const result = await listTenderBids(token, found.id);
        setBids(result.bids);
        setComparison(result.comparison);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the tender");
    } finally {
      setLoading(false);
    }
  }, [token, project.id, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startDraft() {
    setBusy(true);
    setError(null);
    try {
      const template = await getBoqTemplate(token, project.id);
      setBuiltArea(template.builtAreaSqft);
      setItems(template.items.map(toDraft));
      setForm({
        title: `Construction package — ${project.title}`,
        scope: "",
        // A fortnight is a normal window for a small building tender.
        deadlineAt: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
        siteVisitAt: "",
      });
      setDrafting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the BOQ");
    } finally {
      setBusy(false);
    }
  }

  function payload(): TenderInput {
    return {
      title: form.title,
      scope: form.scope,
      // Blank or zero-quantity lines are dropped — an owner shouldn't have to
      // delete every optional row the template offered.
      items: items
        .filter((i) => i.description.trim() && Number(i.quantity) > 0)
        .map((i) => ({
          description: i.description.trim(),
          unit: i.unit.trim(),
          quantity: Number(i.quantity),
          guideRateBdt: i.guideRateBdt ? Number(i.guideRateBdt) : undefined,
        })),
      deadlineAt: new Date(`${form.deadlineAt}T23:59:00+06:00`).toISOString(),
      siteVisitAt: form.siteVisitAt
        ? new Date(`${form.siteVisitAt}T10:00:00+06:00`).toISOString()
        : undefined,
    };
  }

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Only a draft can be edited in place. A cancelled tender is history, so
      // drafting after one starts a fresh tender rather than reviving the old.
      const saved =
        tender && tender.status === TenderStatus.DRAFT
          ? await updateTender(token, tender.id, payload())
          : await createTender(token, project.id, payload());
      setTender(saved);
      setDrafting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the tender");
    } finally {
      setBusy(false);
    }
  }

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
  // Nothing to show a non-owner here — contractors work from /tenders.
  if (!isOwner && !tender) return null;
  if (!isOwner) return null;

  const total = items.reduce(
    (sum, i) => sum + Number(i.quantity || 0) * Number(i.guideRateBdt || 0),
    0
  );

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Contractor bidding</h2>

      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {/* Nothing yet ---------------------------------------------------- */}
        {!tender && !drafting && (
          <div>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              Publish a Bill of Quantities and let verified contractors bid on it. Bids stay sealed
              until you close bidding, so nobody can price against anybody else.
            </p>
            <button
              type="button"
              onClick={startDraft}
              disabled={busy}
              className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {busy ? "Building the BOQ…" : "Draft a tender"}
            </button>
          </div>
        )}

        {/* The drafting table --------------------------------------------- */}
        {drafting && (
          <form onSubmit={saveDraft}>
            {builtArea !== null && (
              <p className="mb-4 rounded-xl bg-sky-100 px-4 py-2.5 text-sm text-sky-900 dark:bg-sky-400/15 dark:text-sky-200">
                {builtArea > 0
                  ? `Quantities pre-filled from the ${builtArea.toLocaleString()} sq ft drawn in the floor plan. Edit anything that doesn't match.`
                  : "No floor plan drawn yet, so quantities start at zero — fill them in, or draw the plan first."}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Tender title
                </span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Scope of work
                </span>
                <textarea
                  value={form.scope}
                  onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                  required
                  rows={3}
                  placeholder="What's included, what isn't, site conditions, expected standards…"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Bidding closes
                </span>
                <input
                  type="date"
                  value={form.deadlineAt}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm((f) => ({ ...f, deadlineAt: e.target.value }))}
                  required
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Site visit day (optional)
                </span>
                <input
                  type="date"
                  value={form.siteVisitAt}
                  onChange={(e) => setForm((f) => ({ ...f, siteVisitAt: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>

            <p className="mt-5 text-sm font-bold">Bill of Quantities</p>
            <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
              Contractors see the description, unit and quantity. Your guide rate stays private —
              it&apos;s only there to measure their bids against.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs text-stone-500 dark:border-white/10 dark:text-slate-500">
                    <th className="pb-2 font-semibold">Description</th>
                    <th className="pb-2 font-semibold">Unit</th>
                    <th className="pb-2 font-semibold">Quantity</th>
                    <th className="pb-2 font-semibold">Guide rate (private)</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-1.5 pr-2">
                        <input
                          value={item.description}
                          onChange={(e) =>
                            setItems((list) =>
                              list.map((r, j) =>
                                j === i ? { ...r, description: e.target.value } : r
                              )
                            )
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          value={item.unit}
                          onChange={(e) =>
                            setItems((list) =>
                              list.map((r, j) => (j === i ? { ...r, unit: e.target.value } : r))
                            )
                          }
                          className={`${inputClass} w-20`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            setItems((list) =>
                              list.map((r, j) => (j === i ? { ...r, quantity: e.target.value } : r))
                            )
                          }
                          className={`${inputClass} w-28`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.guideRateBdt}
                          onChange={(e) =>
                            setItems((list) =>
                              list.map((r, j) =>
                                j === i ? { ...r, guideRateBdt: e.target.value } : r
                              )
                            )
                          }
                          className={`${inputClass} w-28`}
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                          className="text-stone-500 transition hover:text-rose-600"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setItems((list) => [
                    ...list,
                    { description: "", unit: "", quantity: "0", guideRateBdt: "0" },
                  ])
                }
                className="text-xs font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
              >
                + Add a line
              </button>
              <p className="text-sm font-bold">Your estimate: {formatBdt(Math.round(total))}</p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => setDrafting(false)}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* A live tender --------------------------------------------------- */}
        {tender && !drafting && (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{tender.title}</p>
                <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                  {tender.items.length} work items ·{" "}
                  {tender.status === TenderStatus.OPEN
                    ? `closes ${formatDate(tender.deadlineAt)} · ${timeLeft(tender.deadlineAt)}`
                    : `closed ${formatDate(tender.deadlineAt)}`}
                  {tender.estimatedBdt ? ` · your estimate ${formatBdt(tender.estimatedBdt)}` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[tender.status]}`}
              >
                {statusLabels[tender.status]}
              </span>
            </div>

            {tender.status === TenderStatus.DRAFT && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => publishTender(token, tender.id))}
                  className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  Publish for bidding
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      title: tender.title,
                      scope: tender.scope,
                      deadlineAt: tender.deadlineAt.slice(0, 10),
                      siteVisitAt: tender.siteVisitAt?.slice(0, 10) ?? "",
                    });
                    setItems(
                      tender.items.map((i) => ({
                        description: i.description,
                        unit: i.unit,
                        quantity: String(i.quantity),
                        guideRateBdt: String(i.guideRateBdt ?? 0),
                      }))
                    );
                    setDrafting(true);
                  }}
                  className="rounded-full border border-stone-300/80 px-5 py-2.5 text-xs font-bold transition hover:border-amber-400/60 dark:border-white/15"
                >
                  Edit draft
                </button>
              </div>
            )}

            {/* Called off — the record stays, but the way forward is a new one. */}
            {tender.status === TenderStatus.CANCELLED && (
              <div className="mt-4">
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  You cancelled this tender, so no contractor is pricing it any more. Start a fresh
                  one whenever you're ready — the BOQ is rebuilt from your floor plan.
                </p>
                <button
                  type="button"
                  onClick={startDraft}
                  disabled={busy}
                  className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy ? "Building the BOQ…" : "Draft a new tender"}
                </button>
              </div>
            )}

            {/* Sealed: the owner sees a count and nothing else. */}
            {tender.status === TenderStatus.OPEN && (
              <div className="mt-4 rounded-xl border border-sky-400/40 bg-sky-400/10 p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Lock className="h-4 w-4" />
                  {tender.bidCount} sealed {tender.bidCount === 1 ? "bid" : "bids"} received
                </p>
                <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
                  Nobody can read a bid until bidding closes — including you. That&apos;s what stops
                  a late bidder pricing against an early one.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => closeTender(token, tender.id))}
                    className="rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    Close bidding now
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Cancel this tender? Contractors will be told.")) {
                        void run(() => cancelTender(token, tender.id));
                      }
                    }}
                    className="text-xs font-semibold text-rose-600 underline underline-offset-2 dark:text-rose-400"
                  >
                    Cancel tender
                  </button>
                </div>
              </div>
            )}

            {/* Comparison ------------------------------------------------- */}
            {(tender.status === TenderStatus.CLOSED || tender.status === TenderStatus.AWARDED) &&
              comparison && (
                <div className="mt-5">
                  {bids.length === 0 ? (
                    <p className="text-sm text-stone-600 dark:text-slate-400">
                      No bids came in before the deadline.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-bold">Bid comparison</p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="border-b border-black/10 text-left text-xs text-stone-500 dark:border-white/10 dark:text-slate-500">
                              <th className="pb-2 font-semibold">Item</th>
                              <th className="pb-2 font-semibold">Qty</th>
                              <th className="pb-2 font-semibold">Guide</th>
                              <th className="pb-2 font-semibold">Median</th>
                              {bids.map((bid) => (
                                <th key={bid.id} className="pb-2 font-semibold">
                                  {bid.contractor.company || bid.contractor.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {comparison.rows.map((row) => (
                              <tr
                                key={row.itemId}
                                className="border-b border-black/5 dark:border-white/5"
                              >
                                <td className="py-2 pr-3">{row.description}</td>
                                <td className="py-2 pr-3 text-xs text-stone-500 dark:text-slate-500">
                                  {row.quantity} {row.unit}
                                </td>
                                <td className="py-2 pr-3 text-xs text-stone-500 dark:text-slate-500">
                                  {row.guideRateBdt ?? "—"}
                                </td>
                                <td className="py-2 pr-3 text-xs text-stone-500 dark:text-slate-500">
                                  {row.medianRateBdt ?? "—"}
                                </td>
                                {bids.map((bid) => {
                                  const rate = row.rates[bid.id];
                                  // Flag anything meaningfully under the median —
                                  // an unusually cheap line is where corners get cut.
                                  const low =
                                    rate !== undefined &&
                                    row.medianRateBdt !== undefined &&
                                    rate < row.medianRateBdt * 0.8;
                                  return (
                                    <td
                                      key={bid.id}
                                      className={`py-2 pr-3 font-semibold ${
                                        low ? "text-amber-600 dark:text-amber-400" : ""
                                      }`}
                                      title={low ? "Well below the median rate" : undefined}
                                    >
                                      {rate ?? "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            <tr className="font-bold">
                              <td className="pt-3">Total</td>
                              <td />
                              <td />
                              <td />
                              {bids.map((bid) => (
                                <td key={bid.id} className="pt-3">
                                  {formatBdt(bid.totalBdt)}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-5 space-y-3">
                        {bids.map((bid) => (
                          <div
                            key={bid.id}
                            className="rounded-xl border border-stone-200/80 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold">
                                  {bid.contractor.company || bid.contractor.name}
                                  {comparison.lowestBidId === bid.id && (
                                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                                      Lowest
                                    </span>
                                  )}
                                  {bid.status === BidStatus.AWARDED && (
                                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                                      Awarded
                                    </span>
                                  )}
                                  {bid.status === BidStatus.SHORTLISTED && (
                                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-400/15 dark:text-sky-300">
                                      Shortlisted
                                    </span>
                                  )}
                                </p>
                                <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                                  {formatBdt(bid.totalBdt)} · {bid.timelineWeeks} weeks · price
                                  valid {bid.validityDays} days
                                  {bid.contractorRating
                                    ? ` · ${bid.contractorRating.avg.toFixed(1)}★ (${bid.contractorRating.count})`
                                    : " · no ratings yet"}
                                </p>
                                {bid.coverLetter && (
                                  <p className="mt-2 text-sm whitespace-pre-wrap">
                                    {bid.coverLetter}
                                  </p>
                                )}
                              </div>

                              {tender.status === TenderStatus.CLOSED && (
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => run(() => shortlistBid(token, bid.id))}
                                    className="rounded-full border border-stone-300/80 px-4 py-1.5 text-xs font-bold transition hover:border-amber-400/60 disabled:opacity-60 dark:border-white/15"
                                  >
                                    {bid.status === BidStatus.SHORTLISTED
                                      ? "Un-shortlist"
                                      : "Shortlist"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Award this build to ${bid.contractor.company || bid.contractor.name} for ${formatBdt(bid.totalBdt)}? This creates the contract and starts construction.`
                                        )
                                      ) {
                                        void run(() => awardBid(token, bid.id));
                                      }
                                    }}
                                    className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                                  >
                                    Award
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </section>
  );
}
