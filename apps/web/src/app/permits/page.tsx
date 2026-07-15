"use client";

import { useEffect, useState } from "react";
import {
  KATHA_TO_SQM,
  LandUse,
  type DapZone,
  type EcpsStep,
  type FeeEstimate,
} from "@buildora/shared";
import { estimateFee, listDapZones, listEcpsSteps } from "@/lib/apiPermits";
import { Navbar } from "@/components/landing/Navbar";
import { formatBdt } from "@/components/app/projectStatus";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const landUseLabels: Record<string, string> = {
  [LandUse.RESIDENTIAL]: "Residential",
  [LandUse.COMMERCIAL]: "Commercial",
  [LandUse.MIXED_USE]: "Mixed use",
  [LandUse.INDUSTRIAL]: "Industrial",
  [LandUse.INSTITUTIONAL]: "Institutional",
};

type Tab = "dap" | "fees" | "ecps";

/**
 * The public permit toolkit: DAP zone checker, RAJUK fee calculator, and the
 * ECPS process guide. All three read live, admin-maintained data from the API
 * — nothing here is hardcoded.
 */
export default function PermitsPage() {
  const [tab, setTab] = useState<Tab>("dap");

  const tabs: { id: Tab; label: string }[] = [
    { id: "dap", label: "DAP zone checker" },
    { id: "fees", label: "RAJUK fee calculator" },
    { id: "ecps", label: "ECPS guide" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Permit toolkit
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Know the rules before you build
          </h1>
          <p className="mt-3 text-stone-600 dark:text-slate-400">
            Check what your plot allows, estimate the RAJUK permit fee, and see the ECPS process end
            to end. Buildora guides you through RAJUK&apos;s system — it doesn&apos;t replace it.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  tab === t.id
                    ? "bg-amber-400 text-stone-950"
                    : "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "dap" && <DapChecker />}
            {tab === "fees" && <FeeCalculator />}
            {tab === "ecps" && <EcpsGuide />}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Search the admin-maintained DAP zone records by area name or zone code. */
function DapChecker() {
  const [search, setSearch] = useState("");
  const [zones, setZones] = useState<DapZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landKatha, setLandKatha] = useState("");

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        setZones(await listDapZones(search));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load zones");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const katha = Number(landKatha) || 0;

  return (
    <div className={cardClass}>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your area — Dhanmondi, Gulshan, Uttara…"
          className={inputClass}
        />
        <input
          type="number"
          min="0"
          step="0.5"
          value={landKatha}
          onChange={(e) => setLandKatha(e.target.value)}
          placeholder="Your plot size in katha (optional)"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      ) : zones.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
          No zone matched — try a different spelling, or ask a supervisor to add your area.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {zones.map((z) => {
            // FAR × plot area = the total floor area the zone allows.
            const allowedFloorAreaSqm = katha > 0 ? z.maxFar * katha * KATHA_TO_SQM : null;
            return (
              <li
                key={z.id}
                className="rounded-2xl border border-black/10 p-4 dark:border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">
                    {z.areaName}{" "}
                    <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-bold dark:bg-white/10">
                      {z.zoneCode}
                    </span>
                  </p>
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                    {landUseLabels[z.landUse] ?? z.landUse}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-slate-500">Max FAR</dt>
                    <dd className="mt-0.5 font-bold">{z.maxFar}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-slate-500">Ground coverage</dt>
                    <dd className="mt-0.5 font-bold">{z.maxGroundCoveragePct}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-500 dark:text-slate-500">Max floors</dt>
                    <dd className="mt-0.5 font-bold">{z.maxFloors ?? "—"}</dd>
                  </div>
                </dl>
                {allowedFloorAreaSqm != null && (
                  <p className="mt-3 rounded-xl bg-emerald-400/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                    On {katha} katha you could build up to{" "}
                    <strong>{Math.round(allowedFloorAreaSqm).toLocaleString()} m²</strong> of total
                    floor area (FAR {z.maxFar}).
                  </p>
                )}
                {z.notes && (
                  <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">{z.notes}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Estimates the RAJUK permit fee from the database rate table. */
function FeeCalculator() {
  const [category, setCategory] = useState<string>(LandUse.RESIDENTIAL);
  const [floorAreaSqm, setFloorAreaSqm] = useState("");
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setEstimate(await estimateFee({ category, floorAreaSqm }));
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Couldn't calculate the fee");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cardClass}>
      <form onSubmit={calculate} className="grid gap-3 sm:grid-cols-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          aria-label="Land-use category"
        >
          {Object.values(LandUse).map((c) => (
            <option key={c} value={c}>
              {landUseLabels[c]}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          value={floorAreaSqm}
          onChange={(e) => setFloorAreaSqm(e.target.value)}
          required
          placeholder="Proposed floor area (m²)"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {busy ? "Calculating…" : "Estimate fee"}
        </button>
      </form>

      <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
        Tip: 1 katha ≈ {KATHA_TO_SQM} m² of plot; total floor area ≈ floors × footprint.
      </p>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {estimate && (
        <div className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5">
          <p className="text-sm text-stone-600 dark:text-slate-400">
            {landUseLabels[estimate.category]} · {estimate.floorAreaSqm.toLocaleString()} m²
          </p>
          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt>Base fee</dt>
              <dd className="font-semibold">{formatBdt(estimate.baseFeeBdt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>
                Area fee ({formatBdt(estimate.ratePerSqmBdt)}/m² ×{" "}
                {estimate.floorAreaSqm.toLocaleString()} m²)
              </dt>
              <dd className="font-semibold">{formatBdt(estimate.areaFeeBdt)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-amber-400/40 pt-2 text-base font-extrabold">
              <dt>Estimated total</dt>
              <dd>{formatBdt(estimate.totalBdt)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
            Indicative only — the final assessment is made by RAJUK on your ECPS application.
          </p>
        </div>
      )}
    </div>
  );
}

/** The ECPS process, step by step, straight from the admin-maintained data. */
function EcpsGuide() {
  const [steps, setSteps] = useState<EcpsStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setSteps(await listEcpsSteps());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the guide");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>;
  if (error)
    return (
      <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
        {error}
      </p>
    );

  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s) => (
        <li key={s.id} className={cardClass}>
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-400 text-lg font-extrabold text-stone-950">
              {s.order}
            </span>
            <div>
              <h3 className="font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{s.description}</p>
              {s.requiredDocuments.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold tracking-wide text-stone-500 uppercase dark:text-slate-500">
                    You&apos;ll need
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-stone-700 dark:text-slate-300">
                    {s.requiredDocuments.map((doc) => (
                      <li key={doc}>{doc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
