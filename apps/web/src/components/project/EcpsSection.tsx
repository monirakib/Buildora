"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProjectStatus, type EcpsApplication, type EcpsStep, type Project } from "@buildora/shared";
import {
  advanceEcpsApplication,
  getEcpsApplication,
  startEcpsApplication,
} from "@/lib/apiProjects";
import { listEcpsSteps } from "@/lib/apiPermits";
import { formatDate } from "@/components/app/projectStatus";
import { surfaceClass } from "@/components/ui/surface";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

/**
 * The project's ECPS (RAJUK permit) tracker: shows the configured steps, where
 * this application stands, and lets the owner/architect tick steps off with a
 * note. The platform tracks the real ECPS process; it doesn't replace it.
 */
export function EcpsSection({
  project,
  token,
  canEdit,
}: {
  project: Project;
  token: string;
  canEdit: boolean;
}) {
  const [steps, setSteps] = useState<EcpsStep[]>([]);
  const [application, setApplication] = useState<EcpsApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [allSteps, app] = await Promise.all([
          listEcpsSteps(),
          getEcpsApplication(token, project.id),
        ]);
        setSteps(allSteps);
        setApplication(app);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the permit tracker");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, project.id]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setApplication(await startEcpsApplication(token, project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start tracking");
    } finally {
      setBusy(false);
    }
  }

  async function advance(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setApplication(await advanceEcpsApplication(token, project.id, note));
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the tracker");
    } finally {
      setBusy(false);
    }
  }

  const doneOrders = new Set(application?.history.map((h) => h.stepOrder) ?? []);
  const currentStep = steps.find((s) => s.order === application?.currentStepOrder);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold tracking-tight">RAJUK permit (ECPS)</h2>
        <Link
          href="/permits"
          className="text-sm font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
        >
          Permit tools & guide →
        </Link>
      </div>

      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        ) : !application ? (
          <div>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              {project.status === ProjectStatus.PERMIT_STAGE ||
              project.status === ProjectStatus.UNDER_CONSTRUCTION ||
              project.status === ProjectStatus.COMPLETED
                ? "Track the ECPS application step by step, from Land Use Clearance to the Occupancy Certificate."
                : "The permit tracker unlocks once the design is approved and the project reaches the permit stage."}
            </p>
            {canEdit &&
              (project.status === ProjectStatus.PERMIT_STAGE ||
                project.status === ProjectStatus.UNDER_CONSTRUCTION ||
                project.status === ProjectStatus.COMPLETED) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={start}
                  className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy ? "Starting…" : "Start tracking"}
                </button>
              )}
          </div>
        ) : (
          <div>
            {application.completed ? (
              <p className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                All ECPS steps complete 🎉
              </p>
            ) : (
              currentStep && (
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  Currently on step {currentStep.order}:{" "}
                  <strong className="text-stone-900 dark:text-slate-100">
                    {currentStep.title}
                  </strong>
                </p>
              )
            )}

            <ol className="mt-4 flex flex-col gap-2">
              {steps.map((s) => {
                const done = doneOrders.has(s.order) || application.completed;
                const isCurrent =
                  !application.completed && s.order === application.currentStepOrder;
                const historyEntry = application.history.find((h) => h.stepOrder === s.order);
                return (
                  <li
                    key={s.id}
                    className={`rounded-2xl border p-3 text-sm ${
                      isCurrent
                        ? "border-amber-400/60 bg-amber-400/10"
                        : "border-black/10 dark:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          done
                            ? "bg-emerald-500 text-white"
                            : isCurrent
                              ? "bg-amber-400 text-stone-950"
                              : "bg-black/10 text-stone-600 dark:bg-white/10 dark:text-slate-300"
                        }`}
                      >
                        {done ? "✓" : s.order}
                      </span>
                      <span className="font-semibold">{s.title}</span>
                    </div>
                    {isCurrent && (
                      <p className="mt-2 text-stone-600 dark:text-slate-400">{s.description}</p>
                    )}
                    {isCurrent && s.requiredDocuments.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-xs text-stone-500 dark:text-slate-500">
                        {s.requiredDocuments.map((doc) => (
                          <li key={doc}>{doc}</li>
                        ))}
                      </ul>
                    )}
                    {historyEntry && (
                      <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                        Done {formatDate(historyEntry.at)}
                        {historyEntry.note ? `, ${historyEntry.note}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            {canEdit && !application.completed && (
              <form onSubmit={advance} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note, e.g. LUC reference no. (optional)"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Mark step done"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
