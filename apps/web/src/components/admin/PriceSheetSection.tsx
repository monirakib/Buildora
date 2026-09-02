"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import {
  PRICE_SHEET_COLUMNS,
  PRICE_STALE_AFTER_DAYS,
  PriceSource,
  ProductCategory,
  type PriceSheetImportReport,
  type PriceSheetItem,
} from "@buildora/shared";
import {
  addPriceItem,
  downloadPriceSheet,
  getPriceSheet,
  importPriceSheet,
  retirePriceItem,
  reviewPendingPrice,
  updatePriceItem,
} from "@/lib/apiAdmin";
import { useSession } from "@/store/useSession";
import { bdtFull, statusLabel, timeAgo } from "@/components/admin/format";
import { surfaceClass } from "@/components/ui/surface";

/**
 * The weekly price sheet.
 *
 * This is the surface an admin actually uses: download last week's sheet, edit
 * it in Excel, upload it back — or fix one number in place when only one number
 * moved. Both paths write to the same append-only MarketPrice collection the
 * cost estimator retrieves from, which is why an edit here is a *new row*
 * rather than a change to an old one. Nothing on this screen can overwrite a
 * price, and that is deliberate: an estimate produced in March has to still be
 * explainable in August.
 *
 * Kept out of the page file because the page's other job — triggering the
 * refresh and reading the run log — is unrelated to it and short.
 */

const cardClass = `${surfaceClass} p-5`;
const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 dark:border-white/10 dark:bg-white/5 dark:text-white";
const theadClass =
  "border-b border-stone-200/80 text-xs font-bold tracking-wider text-stone-500 uppercase dark:border-white/10 dark:text-stone-400";

/** How a price got here. Colour is never the only signal — the label carries it. */
const SOURCE_STYLE: Record<PriceSource, string> = {
  [PriceSource.CURATED]: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  [PriceSource.MARKETPLACE]:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  [PriceSource.FETCHED]: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
};

const SOURCE_LABEL: Record<PriceSource, string> = {
  [PriceSource.CURATED]: "Sheet",
  [PriceSource.MARKETPLACE]: "Marketplace",
  [PriceSource.FETCHED]: "Fetched",
};

/** The empty add-item form. */
const BLANK_ITEM = {
  category: ProductCategory.CEMENT,
  itemLabel: "",
  unit: "",
  priceBdt: "",
  sourceName: "",
  sourceUrl: "",
};

export function PriceSheetSection({ onChanged }: { onChanged?: () => void }) {
  const token = useSession((s) => s.token);

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [pending, setPending] = useState<PriceSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which row is mid-edit, and what has been typed into it so far. Held here
  // rather than in each row so only one row can be open at a time — two
  // half-finished edits is a good way to save the wrong one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(BLANK_ITEM);
  const [saving, setSaving] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<PriceSheetImportReport | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getPriceSheet(token);
      setItems(res.items);
      setPending(res.pending);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the price sheet");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* ------------------------------------------------------------- the CSV --- */

  async function handleDownload() {
    if (!token) return;
    try {
      await downloadPriceSheet(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't download the sheet");
    }
  }

  async function handleImport(file: File) {
    if (!token) return;
    setImporting(true);
    setError(null);
    setReport(null);
    try {
      const result = await importPriceSheet(token, file);
      setReport(result);
      // A rejected file wrote nothing, so there is nothing to reload — but
      // reloading anyway keeps one code path instead of two, and it is one
      // query.
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import the sheet");
    } finally {
      setImporting(false);
      // Cleared so the same file can be picked again after a fix; a file input
      // does not fire change when re-given the value it already holds.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /* ----------------------------------------------------------- row edits --- */

  function startEdit(item: PriceSheetItem) {
    setEditingId(item.priceId);
    setEditValue(String(item.priceBdt));
  }

  async function saveEdit(item: PriceSheetItem) {
    if (!token) return;
    const priceBdt = Number(editValue);
    if (!Number.isFinite(priceBdt) || priceBdt <= 0) {
      setError("Enter a price greater than 0");
      return;
    }

    setBusyId(item.priceId);
    setError(null);
    try {
      await updatePriceItem(token, item.priceId, { priceBdt });
      setEditingId(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new price");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetire(item: PriceSheetItem) {
    if (!token) return;
    if (!window.confirm(`Take “${item.itemLabel}” off the sheet? Its price history is kept.`)) {
      return;
    }

    setBusyId(item.priceId);
    try {
      await retirePriceItem(token, item.priceId);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't retire the item");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setSaving(true);
    setError(null);
    try {
      await addPriceItem(token, {
        category: draft.category,
        itemLabel: draft.itemLabel,
        unit: draft.unit,
        priceBdt: Number(draft.priceBdt),
        sourceName: draft.sourceName || undefined,
        sourceUrl: draft.sourceUrl || undefined,
      });
      setDraft(BLANK_ITEM);
      setShowAdd(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the item");
    } finally {
      setSaving(false);
    }
  }

  async function handleReview(item: PriceSheetItem, decision: "approve" | "reject") {
    if (!token) return;
    setBusyId(item.priceId);
    try {
      await reviewPendingPrice(token, item.priceId, decision);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that decision");
    } finally {
      setBusyId(null);
    }
  }

  /* -------------------------------------------------------------- render --- */

  return (
    <div className="space-y-6">
      {/* ---- The weekly file ---- */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="text-sm text-stone-600 dark:text-stone-300">
              <p className="font-bold text-stone-900 dark:text-white">
                The weekly sheet — download, edit in Excel, upload back.
              </p>
              <p className="mt-1">
                Uploading adds new items and records a new price for anything that moved. Items
                already at the same price are skipped, and items missing from the file are reported
                but never removed — take one off deliberately with the bin icon instead. A file with
                a bad row is rejected whole, with the line numbers.
              </p>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                Columns: <code>{PRICE_SHEET_COLUMNS.join(", ")}</code>. Only the first four are
                required.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-bold transition hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>

            {/* The real input is hidden and driven by the button: a bare file
                input can't be styled to match anything around it. */}
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {importing ? "Importing & repricing…" : "Upload CSV"}
            </button>
          </div>
        </div>

        {report && <ImportReport report={report} />}
      </section>

      {error && (
        <p className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {error}
        </p>
      )}

      {/* ---- Waiting for review ---- */}
      {pending.length > 0 && (
        <section className={cardClass}>
          <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
            Waiting for review ({pending.length})
          </h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Read off a manufacturer&apos;s price page by the weekly job. None of these can move an
            estimate until you approve it — a parser meeting a redesigned page produces confident
            nonsense, so a person checks the number first.
          </p>

          <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
            {pending.map((item) => (
              <li key={item.priceId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-stone-900 dark:text-white">
                    {item.itemLabel}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {statusLabel(item.category)} · {item.sourceName} · {timeAgo(item.effectiveFrom)}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-stone-900 dark:text-white">
                  {bdtFull(item.priceBdt)}
                  <span className="text-xs font-medium text-stone-500"> /{item.unit}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.priceId}
                    onClick={() => handleReview(item, "approve")}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.priceId}
                    onClick={() => handleReview(item, "reject")}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold transition hover:bg-stone-50 disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- The sheet itself ---- */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
              Current prices ({items.length})
            </h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              What the cost estimator prices against right now. Editing a price writes a new dated
              row — nothing is overwritten.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-stone-200 px-3.5 py-2 text-sm font-bold transition hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
          >
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAdd ? "Cancel" : "Add item"}
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="mt-4 grid gap-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:bg-white/5"
          >
            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Category
              <select
                required
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as ProductCategory })
                }
                className={`mt-1 ${inputClass}`}
              >
                {Object.values(ProductCategory).map((c) => (
                  <option key={c} value={c}>
                    {statusLabel(c)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Item
              <input
                required
                maxLength={120}
                placeholder="OPC cement, 50kg bag"
                value={draft.itemLabel}
                onChange={(e) => setDraft({ ...draft, itemLabel: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>

            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Unit
              <input
                required
                maxLength={30}
                placeholder="bag"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>

            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Price (BDT)
              <input
                required
                type="number"
                min="1"
                step="0.01"
                placeholder="540"
                value={draft.priceBdt}
                onChange={(e) => setDraft({ ...draft, priceBdt: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>

            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Where it came from <span className="font-medium text-stone-400">(optional)</span>
              <input
                maxLength={120}
                placeholder="TCB bulletin, 2 Sep"
                value={draft.sourceName}
                onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>

            <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
              Link <span className="font-medium text-stone-400">(optional)</span>
              <input
                type="url"
                maxLength={500}
                placeholder="https://…"
                value={draft.sourceUrl}
                onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add to the sheet"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            The sheet is empty. Upload a CSV or add items one at a time — until then the estimator
            falls back to its seeded rates.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th className="px-2 py-2.5">Item</th>
                  <th className="px-2 py-2.5">Category</th>
                  <th className="px-2 py-2.5 text-right">Price</th>
                  <th className="px-2 py-2.5">Source</th>
                  <th className="px-2 py-2.5">Updated</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {items.map((item) => {
                  const editing = editingId === item.priceId;
                  const busy = busyId === item.priceId;
                  const move =
                    item.previousPriceBdt && item.previousPriceBdt !== item.priceBdt
                      ? (item.priceBdt - item.previousPriceBdt) / item.previousPriceBdt
                      : null;

                  return (
                    <tr key={item.priceId} className="align-middle">
                      <td className="px-2 py-3">
                        <p className="font-bold text-stone-900 dark:text-white">{item.itemLabel}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          per {item.unit}
                          {item.revisions > 1 && ` · ${item.revisions} revisions`}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-xs text-stone-500 dark:text-stone-400">
                        {statusLabel(item.category)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {editing ? (
                          <input
                            autoFocus
                            type="number"
                            min="1"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(item);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-28 rounded-lg border border-amber-400 bg-white px-2 py-1 text-right text-sm outline-none dark:bg-white/10 dark:text-white"
                          />
                        ) : (
                          <>
                            <span className="font-extrabold text-stone-900 dark:text-white">
                              {bdtFull(item.priceBdt)}
                            </span>
                            {move !== null && (
                              <span
                                className={`ml-1.5 text-xs font-bold ${
                                  move > 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {move > 0 ? "↑" : "↓"}
                                {Math.abs(move * 100).toFixed(1)}%
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          title={item.sourceName}
                          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold ${SOURCE_STYLE[item.source]}`}
                        >
                          {SOURCE_LABEL[item.source]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs">
                        <span
                          className={
                            item.ageDays > PRICE_STALE_AFTER_DAYS
                              ? "font-bold text-orange-600 dark:text-orange-400"
                              : "text-stone-500 dark:text-stone-400"
                          }
                        >
                          {timeAgo(item.effectiveFrom)}
                          {item.ageDays > PRICE_STALE_AFTER_DAYS && " · stale"}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1.5">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => saveEdit(item)}
                                aria-label="Save the new price"
                                className="rounded-lg bg-emerald-500 p-1.5 text-white transition hover:bg-emerald-400 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                aria-label="Cancel"
                                className="rounded-lg border border-stone-200 p-1.5 transition hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                aria-label={`Change the price of ${item.itemLabel}`}
                                className="rounded-lg border border-stone-200 p-1.5 transition hover:bg-stone-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRetire(item)}
                                aria-label={`Take ${item.itemLabel} off the sheet`}
                                className="rounded-lg border border-stone-200 p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * What the last import did.
 *
 * Shows the counts even when they are zero, because "0 updated" is the finding
 * that tells an admin they uploaded last week's file by mistake — a bare
 * "imported successfully" would hide exactly that.
 */
function ImportReport({ report }: { report: PriceSheetImportReport }) {
  const failed = report.errors.length > 0;

  return (
    <div
      className={`mt-4 rounded-xl p-4 text-sm ${
        failed
          ? "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200"
          : "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
      }`}
    >
      {failed ? (
        <>
          <p className="font-extrabold">
            Nothing was imported — {report.errors.length} row
            {report.errors.length === 1 ? "" : "s"} couldn&apos;t be read.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {report.errors.slice(0, 12).map((e, i) => (
              <li key={i}>
                <span className="font-bold">Line {e.line}:</span> {e.message}
              </li>
            ))}
            {report.errors.length > 12 && (
              <li className="text-stone-500">…and {report.errors.length - 12} more</li>
            )}
          </ul>
        </>
      ) : (
        <>
          <p className="font-extrabold">
            {report.rowsRead} row{report.rowsRead === 1 ? "" : "s"} read — {report.added} added,{" "}
            {report.updated} repriced, {report.unchanged} unchanged.
          </p>
          <p className="mt-1 text-xs">
            {report.pricesEmbedded} label{report.pricesEmbedded === 1 ? "" : "s"} embedded for
            retrieval · {report.estimatesUpdated} of {report.estimatesChecked} project estimates
            moved.
          </p>
          {report.missing.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-bold">
                {report.missing.length} item{report.missing.length === 1 ? " was" : "s were"} not in
                this file — left as they were
              </summary>
              <ul className="mt-1.5 space-y-0.5 pl-4">
                {report.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
