"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { isWarrantyExpired, type Handover } from "@buildora/shared";
import { acceptHandover, getHandover, saveHandover } from "@/lib/apiResolution";
import { formatDate } from "@/components/app/projectStatus";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";
const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100";

type WarrantyForm = {
  item: string;
  provider: string;
  months: string;
  startsAt: string;
  documentUrl: string;
};

const emptyWarranty = (): WarrantyForm => ({
  item: "",
  provider: "",
  months: "12",
  startsAt: new Date().toISOString().slice(0, 10),
  documentUrl: "",
});

/**
 * The handover package — what makes "completed" mean something.
 *
 * The occupancy certificate is the gate on accepting: a building without one
 * isn't legally usable, so recording a handover of it would be recording a
 * fiction. Once accepted the record locks, because from then on it's evidence
 * of what was handed over rather than a working document.
 */
export function HandoverSection({
  projectId,
  token,
  isOwner,
  onChanged,
}: {
  projectId: string;
  token: string;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [handover, setHandover] = useState<Handover | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    occupancyCertificateNo: "",
    occupancyCertificateUrl: "",
    handedOverAt: "",
    notes: "",
    warranties: [] as WarrantyForm[],
  });

  const load = useCallback(async () => {
    try {
      const found = await getHandover(token, projectId);
      setHandover(found);
      if (found) {
        setForm({
          occupancyCertificateNo: found.occupancyCertificateNo ?? "",
          occupancyCertificateUrl: found.occupancyCertificateUrl ?? "",
          handedOverAt: found.handedOverAt ?? "",
          notes: found.notes ?? "",
          warranties: found.warranties.map((w) => ({
            item: w.item,
            provider: w.provider,
            months: String(w.months),
            startsAt: w.startsAt,
            documentUrl: w.documentUrl ?? "",
          })),
        });
      }
    } catch {
      setHandover(null);
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  // Nothing recorded and nobody who can record it.
  if (!handover && !isOwner) return null;

  const locked = handover?.acceptedByOwner === true;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveHandover(token, projectId, {
        occupancyCertificateNo: form.occupancyCertificateNo || undefined,
        occupancyCertificateUrl: form.occupancyCertificateUrl || undefined,
        handedOverAt: form.handedOverAt || undefined,
        notes: form.notes || undefined,
        warranties: form.warranties
          .filter((w) => w.item.trim() && w.provider.trim())
          .map((w) => ({
            item: w.item,
            provider: w.provider,
            months: Number(w.months || 12),
            startsAt: w.startsAt,
            documentUrl: w.documentUrl || undefined,
          })),
      });
      setEditing(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the handover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Handover &amp; warranties</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {locked && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200">
            <BadgeCheck className="h-4 w-4" />
            Handed over and accepted
            {handover?.acceptedAt ? ` on ${formatDate(handover.acceptedAt)}` : ""}.
          </p>
        )}

        {!handover && !editing && (
          <div>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              Record the occupancy certificate and every warranty the build carries. This is what
              turns a finished project into a documented one, and the warranty dates stay here long
              after everyone has moved on.
            </p>
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, warranties: [emptyWarranty()] });
                  setEditing(true);
                }}
                className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
              >
                Start the handover
              </button>
            )}
          </div>
        )}

        {/* ---- Read view ---- */}
        {handover && !editing && (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-stone-500 dark:text-slate-500">
                  Occupancy certificate
                </dt>
                <dd className="mt-0.5 font-semibold">
                  {handover.occupancyCertificateNo || "-"}
                  {handover.occupancyCertificateUrl && (
                    <a
                      href={handover.occupancyCertificateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-amber-600 underline underline-offset-2 dark:text-amber-400"
                    >
                      View
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500 dark:text-slate-500">Handed over</dt>
                <dd className="mt-0.5 font-semibold">{handover.handedOverAt || "Not yet"}</dd>
              </div>
            </dl>

            {handover.notes && (
              <p className="text-sm text-stone-600 dark:text-slate-400">{handover.notes}</p>
            )}

            {handover.warranties.length > 0 && (
              <div>
                <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                  Warranties
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {handover.warranties.map((w, i) => {
                    const expired = isWarrantyExpired(w);
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-stone-300/60 px-4 py-2.5 text-sm dark:border-white/10"
                      >
                        <ShieldCheck
                          className={`h-4 w-4 shrink-0 ${expired ? "text-stone-400" : "text-emerald-500"}`}
                        />
                        <span className="font-semibold">{w.item}</span>
                        <span className="text-stone-600 dark:text-slate-400">{w.provider}</span>
                        <span
                          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${
                            expired
                              ? "bg-stone-500/15 text-stone-600 dark:text-slate-400"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {expired ? "Expired" : "Covered"} until {w.expiresAt}
                        </span>
                        {w.documentUrl && (
                          <a
                            href={w.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                          >
                            Document
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {isOwner && !locked && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await acceptHandover(token, projectId);
                      await load();
                      onChanged();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Couldn't accept");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {busy ? "Accepting…" : "Accept handover"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- Edit view ---- */}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Occupancy certificate no.</span>
                <input
                  className={inputClass}
                  value={form.occupancyCertificateNo}
                  onChange={(e) => setForm({ ...form, occupancyCertificateNo: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Certificate link</span>
                <input
                  className={inputClass}
                  placeholder="https://…"
                  value={form.occupancyCertificateUrl}
                  onChange={(e) => setForm({ ...form, occupancyCertificateUrl: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Handover date</span>
                <input
                  className={inputClass}
                  type="date"
                  value={form.handedOverAt}
                  onChange={(e) => setForm({ ...form, handedOverAt: e.target.value })}
                />
              </label>
            </div>

            <textarea
              className={inputClass}
              rows={2}
              placeholder="Anything the owner should know at handover."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <p className="mt-2 text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
              Warranties
            </p>
            {form.warranties.map((w, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-stone-300/60 p-3 sm:grid-cols-[1fr_1fr_6rem_10rem_auto] dark:border-white/10"
              >
                <input
                  className={inputClass}
                  placeholder="What it covers"
                  value={w.item}
                  onChange={(e) => {
                    const next = [...form.warranties];
                    next[i] = { ...w, item: e.target.value };
                    setForm({ ...form, warranties: next });
                  }}
                />
                <input
                  className={inputClass}
                  placeholder="Provider"
                  value={w.provider}
                  onChange={(e) => {
                    const next = [...form.warranties];
                    next[i] = { ...w, provider: e.target.value };
                    setForm({ ...form, warranties: next });
                  }}
                />
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  title="Months of cover"
                  value={w.months}
                  onChange={(e) => {
                    const next = [...form.warranties];
                    next[i] = { ...w, months: e.target.value };
                    setForm({ ...form, warranties: next });
                  }}
                />
                <input
                  className={inputClass}
                  type="date"
                  value={w.startsAt}
                  onChange={(e) => {
                    const next = [...form.warranties];
                    next[i] = { ...w, startsAt: e.target.value };
                    setForm({ ...form, warranties: next });
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove warranty"
                  onClick={() =>
                    setForm({ ...form, warranties: form.warranties.filter((_, j) => j !== i) })
                  }
                  className="grid place-items-center rounded-xl px-3 text-stone-500 transition hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setForm({ ...form, warranties: [...form.warranties, emptyWarranty()] })
              }
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-stone-300 px-5 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <Plus className="h-4 w-4" /> Add warranty
            </button>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save handover"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-500">
              Accepting handover needs the occupancy certificate attached, and locks this record.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
