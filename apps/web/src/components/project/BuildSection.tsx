"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MapPin, XCircle } from "lucide-react";
import {
  InspectionVerdict,
  MilestoneStatus,
  PaymentPurpose,
  type BuildContract,
  type InspectionTemplate,
  type Milestone,
  type Project,
} from "@buildora/shared";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { GatewayPayButton } from "@/components/app/GatewayPayButton";
import { uploadImage } from "@/lib/api";
import {
  claimMilestone,
  fundMilestone,
  getProjectBuild,
  inspectMilestone,
  listInspectionTemplates,
  releaseMilestone,
} from "@/lib/apiBuild";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const statusLabels: Record<MilestoneStatus, string> = {
  [MilestoneStatus.PENDING]: "Not funded",
  [MilestoneStatus.FUNDED]: "Funded, in progress",
  [MilestoneStatus.AWAITING_INSPECTION]: "Awaiting inspection",
  [MilestoneStatus.INSPECTION_PASSED]: "Passed, ready to release",
  [MilestoneStatus.INSPECTION_FAILED]: "Failed inspection",
  [MilestoneStatus.RELEASED]: "Paid",
};

const statusStyles: Record<MilestoneStatus, string> = {
  [MilestoneStatus.PENDING]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
  [MilestoneStatus.FUNDED]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [MilestoneStatus.AWAITING_INSPECTION]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [MilestoneStatus.INSPECTION_PASSED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [MilestoneStatus.INSPECTION_FAILED]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  [MilestoneStatus.RELEASED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

/**
 * Construction, once a bid has been awarded.
 *
 * One card per milestone, and each shows only the action the viewer is the one
 * to take: the owner funds and releases, the contractor claims a stage
 * complete, the engineer inspects. That mirrors the server's rules rather than
 * duplicating them — the API refuses the rest either way.
 */
export function BuildSection({
  project,
  token,
  userId,
  onChanged,
}: {
  project: Project;
  token: string;
  userId: string;
  onChanged: () => void;
}) {
  const [contract, setContract] = useState<BuildContract | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which milestone has its inspection form open.
  const [inspecting, setInspecting] = useState<string | null>(null);
  // Which milestone has the manual funding form open.
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [fundForm, setFundForm] = useState({ method: "BANK", reference: "" });

  const load = useCallback(async () => {
    try {
      const result = await getProjectBuild(token, project.id);
      setContract(result.contract);
      setMilestones(result.milestones);
    } catch {
      // A viewer with no stake in the build gets a 404 — nothing to show.
      setContract(null);
    } finally {
      setLoading(false);
    }
  }, [token, project.id]);

  useEffect(() => {
    void load();
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

  if (loading || !contract) return null;

  const isClient = contract.client.id === userId;
  const isContractor = contract.contractor.id === userId;
  const isEngineer = contract.engineer?.id === userId;

  const paid = milestones.filter((m) => m.status === MilestoneStatus.RELEASED).length;
  const progressPct = milestones.length > 0 ? Math.round((paid / milestones.length) * 100) : 0;

  async function openInspection(milestoneId: string) {
    setInspecting(milestoneId);
    setError(null);
    if (templates.length === 0) {
      try {
        setTemplates(await listInspectionTemplates(token));
      } catch {
        setError("Couldn't load the inspection checklists");
      }
    }
  }

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Construction</h2>

      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold">{contract.contractor.company || contract.contractor.name}</p>
            <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
              Contract sum {formatBdt(contract.contractSumBdt)} · {contract.timelineWeeks} weeks
              {contract.engineer ? ` · signed off by ${contract.engineer.name}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {paid} of {milestones.length} stages paid
          </span>
        </div>

        {/* Progress across the whole build. */}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
          {formatBdt(contract.releasedToContractorBdt)} released ·{" "}
          {formatBdt(contract.commissionBdt)} platform commission
        </p>

        {!contract.engineer && (
          <p className="mt-4 rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
            No structural engineer is appointed on this project, so no one can sign off a stage.
            Appoint one before funding the first milestone.
          </p>
        )}

        {/* The schedule ---------------------------------------------------- */}
        <ul className="mt-5 space-y-3">
          {milestones.map((m) => {
            const latest = m.inspections[m.inspections.length - 1];
            return (
              <li
                key={m.id}
                className="rounded-xl border border-stone-200/80 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {m.order}. {m.title}
                    </p>
                    <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                      {formatBdt(m.amountBdt)} · {m.amountPct}% of the contract
                      {m.targetDate ? ` · target ${formatDate(m.targetDate)}` : ""}
                      {m.releasedAmountBdt ? ` · ${formatBdt(m.releasedAmountBdt)} paid out` : ""}
                    </p>
                    {m.description && (
                      <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                        {m.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[m.status]}`}
                  >
                    {statusLabels[m.status]}
                  </span>
                </div>

                {/* Inspection history */}
                {m.inspections.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/10">
                    {m.inspections.map((ins) => (
                      <div key={ins.id} className="text-xs">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          {ins.verdict === InspectionVerdict.FAIL ? (
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                          {ins.verdict === InspectionVerdict.FAIL
                            ? "Failed"
                            : ins.verdict === InspectionVerdict.PASS_WITH_NOTES
                              ? "Passed with notes"
                              : "Passed"}{" "}
                          , {ins.inspector.name}, {formatDate(ins.inspectedAt)}
                          {ins.location && (
                            <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-500">
                              <MapPin className="h-3 w-3" />
                              {ins.location.distanceFromPlotM !== undefined
                                ? `${ins.location.distanceFromPlotM} m from the plot`
                                : "location recorded"}
                            </span>
                          )}
                        </p>
                        {ins.notes && (
                          <p className="mt-1 text-stone-600 dark:text-slate-400">{ins.notes}</p>
                        )}
                        <ul className="mt-1 space-y-0.5">
                          {ins.results
                            .filter((r) => !r.passed)
                            .map((r, i) => (
                              <li key={i} className="text-rose-600 dark:text-rose-400">
                                ✗ {r.label}
                                {r.note ? `, ${r.note}` : ""}
                              </li>
                            ))}
                        </ul>
                        <p className="mt-1 text-stone-500 italic dark:text-slate-500">
                          Signed: {ins.signature}
                        </p>
                        {ins.photoUrls.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ins.photoUrls.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt="Inspection photo"
                                  className="h-16 w-16 rounded-lg object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Whose turn is it? --------------------------------------- */}
                <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
                  {/* Owner funds a pending stage. */}
                  {isClient && m.status === MilestoneStatus.PENDING && (
                    <div>
                      <GatewayPayButton
                        token={token}
                        purpose={PaymentPurpose.MILESTONE_ESCROW}
                        refId={m.id}
                        amountBdt={m.amountBdt}
                        label={`Fund this stage, ${formatBdt(m.amountBdt)}`}
                        onUnavailable={(down) => down && setFundingId(m.id)}
                      />
                      {fundingId === m.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(() => fundMilestone(token, contract.id, m.id, fundForm)).then(
                              () => setFundingId(null)
                            );
                          }}
                          className="mt-3 grid gap-2 sm:grid-cols-3"
                        >
                          <select
                            value={fundForm.method}
                            onChange={(e) => setFundForm((f) => ({ ...f, method: e.target.value }))}
                            className={inputClass}
                            aria-label="Payment channel"
                          >
                            <option value="BKASH">bKash</option>
                            <option value="NAGAD">Nagad</option>
                            <option value="BANK">Bank transfer</option>
                          </select>
                          <input
                            value={fundForm.reference}
                            onChange={(e) =>
                              setFundForm((f) => ({ ...f, reference: e.target.value }))
                            }
                            required
                            minLength={4}
                            placeholder="Transaction reference"
                            className={inputClass}
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                          >
                            Record deposit
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Contractor says it's done. */}
                  {isContractor && m.status === MilestoneStatus.FUNDED && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => claimMilestone(token, contract.id, m.id))}
                      className="rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                    >
                      Mark complete & request inspection
                    </button>
                  )}

                  {/* Engineer inspects. */}
                  {isEngineer && m.status === MilestoneStatus.AWAITING_INSPECTION && (
                    <>
                      {inspecting === m.id ? (
                        <InspectionForm
                          templates={templates}
                          busy={busy}
                          onCancel={() => setInspecting(null)}
                          onSubmit={(input) =>
                            run(() => inspectMilestone(token, contract.id, m.id, input)).then(() =>
                              setInspecting(null)
                            )
                          }
                          token={token}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openInspection(m.id)}
                          className="rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-300"
                        >
                          Inspect this stage
                        </button>
                      )}
                    </>
                  )}

                  {/* Owner releases after a pass. */}
                  {isClient && m.status === MilestoneStatus.INSPECTION_PASSED && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Release ${formatBdt(m.amountBdt)} for "${m.title}"? This pays the contractor.`
                          )
                        ) {
                          void run(() => releaseMilestone(token, contract.id, m.id));
                        }
                      }}
                      className="rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                    >
                      Release {formatBdt(m.amountBdt)}
                    </button>
                  )}

                  {/* Everyone else just gets told what's happening. */}
                  {m.status === MilestoneStatus.AWAITING_INSPECTION && !isEngineer && (
                    <p className="text-xs text-stone-600 dark:text-slate-400">
                      Waiting on the structural engineer to inspect and sign off.
                    </p>
                  )}
                  {m.status === MilestoneStatus.PENDING && !isClient && (
                    <p className="text-xs text-stone-600 dark:text-slate-400">
                      Waiting for the owner to fund this stage.
                    </p>
                  )}
                  {m.status === MilestoneStatus.INSPECTION_PASSED && !isClient && (
                    <p className="text-xs text-stone-600 dark:text-slate-400">
                      Passed inspection, waiting for the owner to release the tranche.
                    </p>
                  )}
                  {latest?.verdict === InspectionVerdict.FAIL &&
                    m.status === MilestoneStatus.FUNDED &&
                    isContractor && (
                      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                        Put the defects right, then request another inspection.
                      </p>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** The engineer's checklist form: pick a template, tick it off, sign. */
function InspectionForm({
  templates,
  busy,
  token,
  onSubmit,
  onCancel,
}: {
  templates: InspectionTemplate[];
  busy: boolean;
  token: string;
  onSubmit: (input: {
    templateName: string;
    results: { label: string; passed: boolean; note?: string }[];
    verdict: InspectionVerdict;
    notes?: string;
    photoUrls: string[];
    signature: string;
    location?: { lat: number; lng: number };
  }) => void;
  onCancel: () => void;
}) {
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? "");
  const [results, setResults] = useState<{ label: string; passed: boolean; note?: string }[]>([]);
  const [verdict, setVerdict] = useState<InspectionVerdict>(InspectionVerdict.PASS);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // Load the picked template's items as unticked rows.
  useEffect(() => {
    const template = templates.find((t) => t.name === templateName) ?? templates[0];
    if (template) {
      setTemplateName(template.name);
      setResults(template.items.map((label) => ({ label, passed: true })));
    }
  }, [templateName, templates]);

  function capturePosition() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      // A refused or failed fix is fine — the inspection files without one.
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(token, file);
      setPhotoUrls((list) => [...list, url]);
    } finally {
      setUploading(false);
    }
  }

  const anyFailed = results.some((r) => !r.passed);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          templateName,
          results,
          // A checklist with a failed line can't be a clean pass.
          verdict:
            anyFailed && verdict === InspectionVerdict.PASS
              ? InspectionVerdict.PASS_WITH_NOTES
              : verdict,
          notes: notes.trim() || undefined,
          photoUrls,
          signature,
          location: location ?? undefined,
        });
      }}
      className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4"
    >
      <p className="text-sm font-bold">Inspection</p>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">Checklist</span>
        <select
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className={`${inputClass} mt-1`}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <ul className="mt-3 space-y-2">
        {results.map((r, i) => (
          <li key={i} className="text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={r.passed}
                onChange={(e) =>
                  setResults((list) =>
                    list.map((row, j) => (j === i ? { ...row, passed: e.target.checked } : row))
                  )
                }
                className="mt-1"
              />
              <span className={r.passed ? "" : "text-rose-700 dark:text-rose-400"}>{r.label}</span>
            </label>
            {!r.passed && (
              <input
                value={r.note ?? ""}
                onChange={(e) =>
                  setResults((list) =>
                    list.map((row, j) => (j === i ? { ...row, note: e.target.value } : row))
                  )
                }
                placeholder="What's wrong with it?"
                className={`${inputClass} mt-1`}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">Verdict</span>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as InspectionVerdict)}
            className={`${inputClass} mt-1`}
          >
            <option value={InspectionVerdict.PASS}>Pass</option>
            <option value={InspectionVerdict.PASS_WITH_NOTES}>Pass with notes</option>
            <option value={InspectionVerdict.FAIL}>Fail</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">
            Your certification
          </span>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            required
            minLength={2}
            placeholder="Type your full name"
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-stone-600 dark:text-slate-400">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${inputClass} mt-1`}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={capturePosition}
          className="rounded-full border border-stone-300/80 px-4 py-1.5 text-xs font-bold transition hover:border-amber-400/60 dark:border-white/15"
        >
          {locating ? "Locating…" : location ? "Location captured ✓" : "Capture my location"}
        </button>
        <label className="cursor-pointer rounded-full border border-dashed border-stone-400/60 px-4 py-1.5 text-xs font-bold text-stone-600 transition hover:border-amber-500 dark:border-white/25 dark:text-slate-300">
          {uploading
            ? "Uploading…"
            : `Add photo${photoUrls.length ? ` (${photoUrls.length})` : ""}`}
          <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </label>
      </div>
      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
        Your location is recorded as evidence you inspected on site. It never blocks filing.
      </p>

      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={busy || uploading}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {busy ? "Filing…" : "File inspection"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
