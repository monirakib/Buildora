"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandUse, UserRole, type DapZone, type EcpsStep, type FeeRule } from "@buildora/shared";
import {
  deleteDapZone,
  deleteEcpsStep,
  deleteFeeRule,
  listDapZones,
  listEcpsSteps,
  listFeeRules,
  saveDapZone,
  saveEcpsStep,
  saveFeeRule,
} from "@/lib/apiPermits";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { formatBdt, landUseLabels } from "@/components/app/projectStatus";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const smallButton =
  "rounded-full border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10";

type Tab = "dap" | "fees" | "ecps";

/**
 * Supervisor console for the permit reference data. Everything the public
 * permit tools show is maintained here — DAP zones, RAJUK fee rates, and the
 * ECPS steps — so the rules live in the database, never in the code.
 */
export default function AdminPermitsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [tab, setTab] = useState<Tab>("dap");

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) router.replace("/auth");
    else if (user.role !== UserRole.ADMIN) router.replace("/dashboard");
  }, [mounted, user, token, router]);

  if (!mounted || !user || !token || user.role !== UserRole.ADMIN) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dap", label: "DAP zones" },
    { id: "fees", label: "Fee rates" },
    { id: "ecps", label: "ECPS steps" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Supervisor
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Permit reference data
          </h1>
          <p className="mt-3 text-stone-600 dark:text-slate-400">
            These records power the public DAP checker, fee calculator, and ECPS guide.
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
            {tab === "dap" && <DapZonesAdmin token={token} />}
            {tab === "fees" && <FeeRulesAdmin token={token} />}
            {tab === "ecps" && <EcpsStepsAdmin token={token} />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------- DAP zones ----------

const emptyZoneForm = {
  areaName: "",
  zoneCode: "",
  landUse: String(LandUse.RESIDENTIAL),
  maxFar: "",
  maxGroundCoveragePct: "",
  maxFloors: "",
  notes: "",
};

function DapZonesAdmin({ token }: { token: string }) {
  const [zones, setZones] = useState<DapZone[]>([]);
  const [form, setForm] = useState(emptyZoneForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDapZones("")
      .then(setZones)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load zones"));
  }, []);

  function startEdit(z: DapZone) {
    setEditingId(z.id);
    setForm({
      areaName: z.areaName,
      zoneCode: z.zoneCode,
      landUse: z.landUse,
      maxFar: String(z.maxFar),
      maxGroundCoveragePct: String(z.maxGroundCoveragePct),
      maxFloors: z.maxFloors?.toString() ?? "",
      notes: z.notes ?? "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDapZone(token, form, editingId ?? undefined);
      setZones((list) =>
        editingId ? list.map((z) => (z.id === saved.id ? saved : z)) : [...list, saved]
      );
      setForm(emptyZoneForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the zone");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this zone record?")) return;
    try {
      await deleteDapZone(token, id);
      setZones((list) => list.filter((z) => z.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the zone");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className={cardClass}>
        <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <strong>{z.areaName}</strong> · {z.zoneCode} · {landUseLabels[z.landUse]} · FAR{" "}
                {z.maxFar} · {z.maxGroundCoveragePct}%{z.maxFloors ? ` · ≤${z.maxFloors}F` : ""}
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEdit(z)} className={smallButton}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(z.id)}
                  className={`${smallButton} !border-rose-300 !text-rose-600 dark:!border-rose-400/40 dark:!text-rose-400`}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
          {zones.length === 0 && (
            <li className="py-2.5 text-stone-500 dark:text-slate-500">
              No zones yet, add the first one below (or run `pnpm seed:permits`).
            </li>
          )}
        </ul>
      </div>

      <form onSubmit={save} className={cardClass}>
        <h3 className="font-bold">{editingId ? "Edit zone" : "Add a zone"}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Area name</label>
            <input
              value={form.areaName}
              onChange={(e) => setForm((f) => ({ ...f, areaName: e.target.value }))}
              required
              placeholder="Dhanmondi"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Zone code</label>
            <input
              value={form.zoneCode}
              onChange={(e) => setForm((f) => ({ ...f, zoneCode: e.target.value }))}
              required
              placeholder="DAP-DHN-01"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Land use</label>
            <select
              value={form.landUse}
              onChange={(e) => setForm((f) => ({ ...f, landUse: e.target.value }))}
              className={inputClass}
            >
              {Object.values(LandUse).map((c) => (
                <option key={c} value={c}>
                  {landUseLabels[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Max FAR</label>
            <input
              type="number"
              step="0.05"
              min="0.1"
              value={form.maxFar}
              onChange={(e) => setForm((f) => ({ ...f, maxFar: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Max ground coverage (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.maxGroundCoveragePct}
              onChange={(e) => setForm((f) => ({ ...f, maxGroundCoveragePct: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Max floors{" "}
              <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.maxFloors}
              onChange={(e) => setForm((f) => ({ ...f, maxFloors: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Notes{" "}
              <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
            </label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add zone"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyZoneForm);
              }}
              className={smallButton}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------- Fee rules ----------

const emptyFeeForm = {
  category: String(LandUse.RESIDENTIAL),
  label: "",
  baseFeeBdt: "",
  ratePerSqmBdt: "",
  notes: "",
};

function FeeRulesAdmin({ token }: { token: string }) {
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [form, setForm] = useState(emptyFeeForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listFeeRules()
      .then(setRules)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load fee rules"));
  }, []);

  function startEdit(r: FeeRule) {
    setEditingId(r.id);
    setForm({
      category: r.category,
      label: r.label,
      baseFeeBdt: String(r.baseFeeBdt),
      ratePerSqmBdt: String(r.ratePerSqmBdt),
      notes: r.notes ?? "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveFeeRule(token, form, editingId ?? undefined);
      setRules((list) =>
        editingId ? list.map((r) => (r.id === saved.id ? saved : r)) : [...list, saved]
      );
      setForm(emptyFeeForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the rate");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this fee rate?")) return;
    try {
      await deleteFeeRule(token, id);
      setRules((list) => list.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the rate");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className={cardClass}>
        <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <strong>{r.label}</strong> ({landUseLabels[r.category]}) · base{" "}
                {formatBdt(r.baseFeeBdt)} + {formatBdt(r.ratePerSqmBdt)}/m²
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEdit(r)} className={smallButton}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className={`${smallButton} !border-rose-300 !text-rose-600 dark:!border-rose-400/40 dark:!text-rose-400`}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
          {rules.length === 0 && (
            <li className="py-2.5 text-stone-500 dark:text-slate-500">
              No rates yet, add the first one below (or run `pnpm seed:permits`).
            </li>
          )}
        </ul>
      </div>

      <form onSubmit={save} className={cardClass}>
        <h3 className="font-bold">{editingId ? "Edit rate" : "Add a rate"}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={inputClass}
            >
              {Object.values(LandUse).map((c) => (
                <option key={c} value={c}>
                  {landUseLabels[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Label</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              required
              placeholder="Residential building"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Base fee (BDT)</label>
            <input
              type="number"
              min="0"
              value={form.baseFeeBdt}
              onChange={(e) => setForm((f) => ({ ...f, baseFeeBdt: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rate per m² (BDT)</label>
            <input
              type="number"
              min="0"
              value={form.ratePerSqmBdt}
              onChange={(e) => setForm((f) => ({ ...f, ratePerSqmBdt: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Notes{" "}
              <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
            </label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add rate"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyFeeForm);
              }}
              className={smallButton}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------- ECPS steps ----------

const emptyStepForm = { order: "", title: "", description: "", requiredDocuments: "" };

function EcpsStepsAdmin({ token }: { token: string }) {
  const [steps, setSteps] = useState<EcpsStep[]>([]);
  const [form, setForm] = useState(emptyStepForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEcpsSteps()
      .then(setSteps)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load steps"));
  }, []);

  function startEdit(s: EcpsStep) {
    setEditingId(s.id);
    setForm({
      order: String(s.order),
      title: s.title,
      description: s.description,
      requiredDocuments: s.requiredDocuments.join("\n"),
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // One document per textarea line; blanks dropped.
      const saved = await saveEcpsStep(
        token,
        {
          order: form.order,
          title: form.title,
          description: form.description,
          requiredDocuments: form.requiredDocuments
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        editingId ?? undefined
      );
      setSteps((list) => {
        const next = editingId
          ? list.map((s) => (s.id === saved.id ? saved : s))
          : [...list, saved];
        return next.sort((a, b) => a.order - b.order);
      });
      setForm(emptyStepForm);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the step");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this step?")) return;
    try {
      await deleteEcpsStep(token, id);
      setSteps((list) => list.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the step");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className={cardClass}>
        <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <strong>
                  {s.order}. {s.title}
                </strong>
                {s.requiredDocuments.length > 0 && (
                  <span className="text-stone-500 dark:text-slate-500">
                    {" "}
                    · {s.requiredDocuments.length} document
                    {s.requiredDocuments.length > 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEdit(s)} className={smallButton}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className={`${smallButton} !border-rose-300 !text-rose-600 dark:!border-rose-400/40 dark:!text-rose-400`}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
          {steps.length === 0 && (
            <li className="py-2.5 text-stone-500 dark:text-slate-500">
              No steps yet, add the first one below (or run `pnpm seed:permits`).
            </li>
          )}
        </ul>
      </div>

      <form onSubmit={save} className={cardClass}>
        <h3 className="font-bold">{editingId ? "Edit step" : "Add a step"}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Order</label>
            <input
              type="number"
              min="1"
              max="50"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-3">
            <label className={labelClass}>Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-4">
            <label className={labelClass}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              required
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-4">
            <label className={labelClass}>
              Required documents{" "}
              <span className="font-medium text-stone-500 dark:text-slate-400">(one per line)</span>
            </label>
            <textarea
              value={form.requiredDocuments}
              onChange={(e) => setForm((f) => ({ ...f, requiredDocuments: e.target.value }))}
              rows={3}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add step"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyStepForm);
              }}
              className={smallButton}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
