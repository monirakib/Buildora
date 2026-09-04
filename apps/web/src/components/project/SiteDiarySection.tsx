"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Sun,
  Trash2,
} from "lucide-react";
import {
  LABOUR_TRADE_LABELS,
  LabourTrade,
  dhakaDateKey,
  dhakaDateLabel,
  type LabourCount,
  type MaterialUsed,
  type Project,
  type SiteDiaryEntry,
  type SiteDiarySummary,
  type WeatherForecastDay,
} from "@buildora/shared";
import { uploadImage } from "@/lib/api";
import {
  createSiteDiaryEntry,
  deleteSiteDiaryEntry,
  getSiteForecast,
  listSiteDiary,
  updateSiteDiaryEntry,
} from "@/lib/apiSiteDiary";
import { StatTile } from "@/components/admin/charts";
import { DiaryDigestModal } from "@/components/project/DiaryDigestModal";
import { imageAt } from "@/lib/imageUrl";
import { surfaceClass } from "@/components/ui/surface";
import { ListSkeleton } from "@/components/ui/Skeleton";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

/**
 * WMO weather code → icon. Grouped the way the codes are grouped: clear, cloud,
 * fog, drizzle, rain, thunder. Snow codes fall through to the rain icon since
 * they will never come back for a plot in Bangladesh.
 */
function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const Icon =
    code === 0
      ? Sun
      : code <= 2
        ? CloudSun
        : code === 3
          ? Cloud
          : code <= 48
            ? CloudFog
            : code <= 57
              ? CloudDrizzle
              : code >= 95
                ? CloudLightning
                : CloudRain;
  return <Icon className={className} />;
}

/** Empty form, dated today in Dhaka — the day a supervisor is most likely logging. */
function blankForm() {
  return {
    date: dhakaDateKey(new Date()),
    workDone: "",
    labour: [] as LabourCount[],
    materials: [] as MaterialUsed[],
    equipment: "",
    issues: "",
    photoUrls: [] as string[],
  };
}

type FormState = ReturnType<typeof blankForm>;

const emptySummary: SiteDiarySummary = {
  entryCount: 0,
  rainDays: 0,
  totalRainfallMm: 0,
  labourDays: 0,
};

/**
 * The site diary: one entry per day, each stamped with the weather over the
 * plot at the time it was written.
 *
 * The rain-day tally in the header is the point of the weather integration —
 * it turns "we lost the week to rain" into a number backed by the day's
 * recorded rainfall, which is what a delay claim against a milestone needs.
 */
export function SiteDiarySection({
  project,
  token,
  userId,
  canWrite,
}: {
  project: Project;
  token: string;
  userId: string;
  canWrite: boolean;
}) {
  const [entries, setEntries] = useState<SiteDiaryEntry[]>([]);
  const [digestOpen, setDigestOpen] = useState(false);
  const [summary, setSummary] = useState<SiteDiarySummary>(emptySummary);
  const [forecast, setForecast] = useState<WeatherForecastDay[]>([]);
  const [hasPlotPin, setHasPlotPin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Which entry the form is editing (null while writing a new one), and whether
  // the form is open at all.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);

  const load = useCallback(async () => {
    try {
      const result = await listSiteDiary(token, project.id);
      setEntries(result.entries);
      setSummary(result.summary);
      setHasPlotPin(result.hasPlotPin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the site diary");
    } finally {
      setLoading(false);
    }
  }, [token, project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The forecast is a separate call so a weather outage can't stop the diary
  // itself from loading. It returns an empty list on any failure.
  useEffect(() => {
    void getSiteForecast(token, project.id).then(setForecast);
  }, [token, project.id]);

  function openNew() {
    setForm(blankForm());
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(entry: SiteDiaryEntry) {
    setForm({
      date: entry.date,
      workDone: entry.workDone,
      labour: entry.labour,
      materials: entry.materials,
      equipment: entry.equipment ?? "",
      issues: entry.issues ?? "",
      photoUrls: entry.photoUrls,
    });
    setEditingId(entry.id);
    setShowForm(true);
    setError(null);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(token, file);
      setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      workDone: form.workDone,
      labour: form.labour,
      materials: form.materials,
      // Blank optional text should not be sent as an empty string.
      equipment: form.equipment.trim() || undefined,
      issues: form.issues.trim() || undefined,
      photoUrls: form.photoUrls,
    };

    try {
      const result = editingId
        ? await updateSiteDiaryEntry(token, project.id, editingId, payload)
        : await createSiteDiaryEntry(token, project.id, { ...payload, date: form.date });

      setEntries((list) => {
        const without = list.filter((entry) => entry.id !== result.entry.id);
        // Newest day first, matching the order the API returns.
        return [...without, result.entry].sort((a, b) => b.date.localeCompare(a.date));
      });
      setSummary(result.summary);
      setShowForm(false);
      setEditingId(null);
      setForm(blankForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the entry");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: SiteDiaryEntry) {
    if (!window.confirm(`Delete the diary entry for ${entry.date}?`)) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(await deleteSiteDiaryEntry(token, project.id, entry.id));
      setEntries((list) => list.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the entry");
    } finally {
      setBusy(false);
    }
  }

  // --- form row editors ----------------------------------------------------

  function setLabour(index: number, patch: Partial<LabourCount>) {
    setForm((f) => ({
      ...f,
      labour: f.labour.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function setMaterial(index: number, patch: Partial<MaterialUsed>) {
    setForm((f) => ({
      ...f,
      materials: f.materials.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display-title text-2xl">Site diary</h2>
        {canWrite && !showForm && (
          <button
            type="button"
            onClick={openNew}
            className="rounded-full btn-primary px-5 py-2 text-sm"
          >
            Log a day
          </button>
        )}
      </div>

      <div className={`mt-4 ${cardClass}`}>
        {error && <p className="mb-4 alert alert-danger">{error}</p>}

        {!hasPlotPin && (
          <p className="mb-4 rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
            This brief has no map pin, so entries can&apos;t be stamped with the site weather. Add
            one to the plot details to turn the rain-day tally on.
          </p>
        )}

        {/* Running totals ------------------------------------------------- */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Days logged" value={String(summary.entryCount)} />
          <StatTile label="Rain days" value={String(summary.rainDays)} sub="Days too wet to work" />
          <StatTile label="Total rainfall" value={`${summary.totalRainfallMm} mm`} />
          <StatTile
            label="Labour-days"
            value={String(summary.labourDays)}
            sub="Every headcount added up"
          />
        </div>

        {/*
          The week read back. Opens on click rather than loading with the page,
          because it costs a model call and most visits here are to write an
          entry, not to review one.
        */}
        {summary.entryCount > 0 && (
          <button
            type="button"
            onClick={() => setDigestOpen(true)}
            className="mt-3 rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-800 transition hover:bg-amber-400/20 dark:text-amber-300"
          >
            This week on site
          </button>
        )}
        {digestOpen && (
          <DiaryDigestModal
            token={token}
            projectId={project.id}
            onClose={() => setDigestOpen(false)}
          />
        )}

        {/* Week ahead ------------------------------------------------------ */}
        {forecast.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-bold">Week ahead over the plot</p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {forecast.map((day) => (
                <div
                  key={day.date}
                  className="w-40 shrink-0 rounded-xl border border-stone-200/80 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-xs font-bold text-stone-500 dark:text-slate-400">
                    {dhakaDateLabel(day.date).slice(0, 8)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <WeatherIcon code={day.weatherCode} className="h-5 w-5 text-amber-700" />
                    <span className="text-sm font-semibold">
                      {Math.round(day.tempMaxC)}° / {Math.round(day.tempMinC)}°
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
                    {day.description} · {day.rainfallMm} mm
                  </p>
                  {day.advisory && (
                    <p className="mt-2 rounded-lg bg-rose-100 px-2 py-1 text-[11px] leading-tight font-semibold text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                      {day.advisory}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The form -------------------------------------------------------- */}
        {showForm && (
          <form
            onSubmit={submit}
            className="mt-6 border-t border-black/10 pt-5 dark:border-white/10"
          >
            <p className="text-sm font-bold">{editingId ? `Editing ${form.date}` : "Log a day"}</p>

            {!editingId && (
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Date
                </span>
                <input
                  type="date"
                  value={form.date}
                  max={dhakaDateKey(new Date())}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                  className={`${inputClass} mt-1`}
                />
              </label>
            )}

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                Work done
              </span>
              <textarea
                value={form.workDone}
                onChange={(e) => setForm((f) => ({ ...f, workDone: e.target.value }))}
                required
                rows={3}
                placeholder="e.g. Ground floor column casting, grid A1–A6"
                className={`${inputClass} mt-1`}
              />
            </label>

            {/* Labour headcount */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                Labour on site
              </p>
              {form.labour.map((row, i) => (
                <div key={i} className="mt-2 flex gap-2">
                  <select
                    value={row.trade}
                    onChange={(e) => setLabour(i, { trade: e.target.value as LabourTrade })}
                    className={inputClass}
                    aria-label="Trade"
                  >
                    {Object.values(LabourTrade).map((t) => (
                      <option key={t} value={t}>
                        {LABOUR_TRADE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={row.count}
                    onChange={(e) => setLabour(i, { count: Number(e.target.value) })}
                    className={`${inputClass} w-28`}
                    aria-label="How many"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, labour: f.labour.filter((_, j) => j !== i) }))
                    }
                    className="shrink-0 rounded-xl px-2 text-stone-500 transition hover:text-rose-600"
                    aria-label="Remove trade"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    labour: [...f.labour, { trade: LabourTrade.MASON, count: 1 }],
                  }))
                }
                className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
              >
                + Add a trade
              </button>
            </div>

            {/* Materials consumed */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                Materials used
              </p>
              {form.materials.map((row, i) => (
                <div key={i} className="mt-2 flex gap-2">
                  <input
                    value={row.item}
                    onChange={(e) => setMaterial(i, { item: e.target.value })}
                    placeholder="Cement"
                    className={inputClass}
                    aria-label="Material"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.quantity}
                    onChange={(e) => setMaterial(i, { quantity: Number(e.target.value) })}
                    className={`${inputClass} w-28`}
                    aria-label="Quantity"
                  />
                  <input
                    value={row.unit}
                    onChange={(e) => setMaterial(i, { unit: e.target.value })}
                    placeholder="bags"
                    className={`${inputClass} w-28`}
                    aria-label="Unit"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        materials: f.materials.filter((_, j) => j !== i),
                      }))
                    }
                    className="shrink-0 rounded-xl px-2 text-stone-500 transition hover:text-rose-600"
                    aria-label="Remove material"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    materials: [...f.materials, { item: "", quantity: 0, unit: "" }],
                  }))
                }
                className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
              >
                + Add a material
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Equipment on site
                </span>
                <input
                  value={form.equipment}
                  onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                  placeholder="Mixer, vibrator, 1 truck"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Issues or blockers
                </span>
                <input
                  value={form.issues}
                  onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))}
                  placeholder="Rod delivery delayed"
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>

            {/* Photos */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-600 dark:text-slate-400">Photos</p>
              {form.photoUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.photoUrls.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageAt(url, 160)}
                        alt="Site photo"
                        loading="lazy"
                        decoding="async"
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            photoUrls: f.photoUrls.filter((u) => u !== url),
                          }))
                        }
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 p-1 text-white"
                        aria-label="Remove photo"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="mt-2 flex w-fit cursor-pointer items-center rounded-xl border border-dashed border-stone-400/60 px-4 py-2 text-sm font-semibold text-stone-600 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/25 dark:text-slate-300">
                {uploading ? "Uploading…" : "Add photo"}
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              </label>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={busy || uploading}
                className="rounded-full btn-primary px-6 py-2.5 text-sm disabled:opacity-60"
              >
                {busy ? "Saving…" : editingId ? "Save changes" : "Log the day"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* The diary itself ------------------------------------------------ */}
        <div className="mt-6 border-t border-black/10 pt-5 dark:border-white/10">
          {loading ? (
            <ListSkeleton rows={3} />
          ) : entries.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-slate-400">
              No days logged yet. Each entry records the work done, who was on site, and the weather
              over the plot that day.
            </p>
          ) : (
            <ul className="space-y-4">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-stone-200/80 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{dhakaDateLabel(entry.date)}</p>
                      <p className="text-xs text-stone-500 dark:text-slate-500">
                        Logged by {entry.author.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {entry.weather ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 dark:bg-white/10 dark:text-slate-300">
                          <WeatherIcon code={entry.weather.weatherCode} className="h-3.5 w-3.5" />
                          {entry.weather.description} · {Math.round(entry.weather.tempMaxC)}°/
                          {Math.round(entry.weather.tempMinC)}° · {entry.weather.rainfallMm} mm
                        </span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500 dark:bg-white/10 dark:text-slate-400">
                          Weather unavailable
                        </span>
                      )}
                      {entry.isRainDay && (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800 dark:bg-sky-400/15 dark:text-sky-300">
                          Rain day
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-wrap">{entry.workDone}</p>

                  {entry.labour.length > 0 && (
                    <p className="mt-3 text-xs text-stone-600 dark:text-slate-400">
                      <span className="font-semibold">On site:</span>{" "}
                      {entry.labour
                        .map((l) => `${l.count} × ${LABOUR_TRADE_LABELS[l.trade]}`)
                        .join(", ")}
                    </p>
                  )}

                  {entry.materials.length > 0 && (
                    <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
                      <span className="font-semibold">Materials:</span>{" "}
                      {entry.materials.map((m) => `${m.item} ${m.quantity} ${m.unit}`).join(", ")}
                    </p>
                  )}

                  {entry.equipment && (
                    <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
                      <span className="font-semibold">Equipment:</span> {entry.equipment}
                    </p>
                  )}

                  {entry.issues && (
                    <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                      <span className="font-semibold">Blocker:</span> {entry.issues}
                    </p>
                  )}

                  {entry.photoUrls.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.photoUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageAt(url, 160)}
                            alt="Site photo"
                            loading="lazy"
                            decoding="async"
                            className="h-20 w-20 rounded-lg object-cover transition hover:opacity-80"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {(entry.author.id === userId || project.owner.id === userId) && (
                    <div className="mt-3 flex gap-3 border-t border-black/5 pt-3 dark:border-white/10">
                      {entry.author.id === userId && (
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          className="text-xs font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(entry)}
                        className="text-xs font-semibold text-rose-600 underline underline-offset-2 disabled:opacity-60 dark:text-rose-400"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
