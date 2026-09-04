"use client";

import { ArrowRight, Check, Lock } from "lucide-react";
import type { Project } from "@buildora/shared";
import { PlotMapView } from "@/components/project/PlotMapView";
import { buildingTypeLabels, formatBdt } from "@/components/app/projectStatus";
import { PHASE_LABELS, type PhaseKey, type ProjectProgressResult } from "./phases";
import type { TabKey } from "./tabs";
import { surfaceClass } from "@/components/ui/surface";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

/**
 * The landing tab: what this project is, who's on it, and what happens next.
 *
 * The four phase cards are the point of the page — one screen that answers
 * "where is my build" without scrolling through every section. Each card lists
 * that phase's real gates and jumps to its tab.
 */
export function OverviewTab({
  project,
  progress,
  onJump,
}: {
  project: Project;
  progress: ProjectProgressResult;
  onJump: (tab: TabKey) => void;
}) {
  const { nextUp } = progress;

  return (
    <div className="flex flex-col gap-8">
      {/* What now ----------------------------------------------------- */}
      {nextUp && (
        <button
          type="button"
          onClick={() => onJump(nextUp.phase)}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-left transition hover:border-amber-400/60 hover:bg-amber-400/15"
        >
          <div>
            <p className="text-xs font-bold tracking-wider text-amber-700 uppercase dark:text-amber-400">
              Next up
            </p>
            <p className="mt-1 font-bold">{nextUp.label}</p>
            <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
              in {PHASE_LABELS[nextUp.phase]}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-amber-700 transition group-hover:translate-x-1 dark:text-amber-400" />
        </button>
      )}

      {/* Phase cards --------------------------------------------------- */}
      <section>
        <h2 className="display-title text-2xl">Where the project stands</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(progress.phases) as PhaseKey[]).map((key) => {
            const phase = progress.phases[key];
            const done = phase.gates.filter((g) => g.done).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onJump(key)}
                className={`${cardClass} text-left transition hover:border-amber-400/50`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{PHASE_LABELS[key]}</p>
                  {phase.fraction >= 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3 w-3" /> Done
                    </span>
                  ) : phase.unlocked ? (
                    <span className="text-xs font-bold text-stone-500 dark:text-slate-500">
                      {done}/{phase.gates.length}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-white/10 dark:text-slate-400">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>

                {phase.unlocked ? (
                  // Only the first few gates — the tab itself has the detail.
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {phase.gates.slice(0, 5).map((g, i) => (
                      <li
                        key={`${g.label}-${i}`}
                        className={`flex items-center gap-2 text-sm ${
                          g.done
                            ? "text-stone-500 line-through dark:text-slate-500"
                            : "text-stone-700 dark:text-slate-300"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                            g.done
                              ? "bg-emerald-500 text-white"
                              : "border border-stone-300 dark:border-white/20"
                          }`}
                        >
                          {g.done && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {g.label}
                      </li>
                    ))}
                    {phase.gates.length > 5 && (
                      <li className="mt-0.5 text-xs text-stone-500 dark:text-slate-500">
                        +{phase.gates.length - 5} more
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
                    {phase.blockedReason}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* The brief ----------------------------------------------------- */}
      <section>
        <h2 className="display-title text-2xl">The brief</h2>
        <div className={`mt-4 ${cardClass}`}>
          <p className="text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
            {project.description}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-stone-500 dark:text-slate-500">Address</dt>
              <dd className="mt-0.5 font-semibold">{project.address}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500 dark:text-slate-500">Land</dt>
              <dd className="mt-0.5 font-semibold">{project.landAreaKatha} katha</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500 dark:text-slate-500">Floors</dt>
              <dd className="mt-0.5 font-semibold">{project.floors}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500 dark:text-slate-500">Budget</dt>
              <dd className="mt-0.5 font-semibold">
                {project.budgetMinBdt || project.budgetMaxBdt
                  ? `${project.budgetMinBdt ? formatBdt(project.budgetMinBdt) : "-"} – ${
                      project.budgetMaxBdt ? formatBdt(project.budgetMaxBdt) : "-"
                    }`
                  : "Not set"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
            {buildingTypeLabels[project.buildingType] ?? project.buildingType} · {project.areaName}
          </p>
          {project.location && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-stone-500 dark:text-slate-500">On the map</p>
              <PlotMapView location={project.location} />
            </div>
          )}
        </div>
      </section>

      {/* Who's on it --------------------------------------------------- */}
      <section>
        <h2 className="display-title text-2xl">Your team</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Participant role="Land owner" person={project.owner} />
          <Participant
            role="Architect"
            person={project.architect}
            tab="architect"
            onJump={onJump}
          />
          <Participant role="Engineer" person={project.engineer} tab="engineer" onJump={onJump} />
        </div>
      </section>
    </div>
  );
}

/** One team member, or an empty slot that links to the tab that fills it. */
function Participant({
  role,
  person,
  tab,
  onJump,
}: {
  role: string;
  person?: { id: string; name: string; company?: string };
  tab?: TabKey;
  onJump?: (tab: TabKey) => void;
}) {
  if (!person) {
    return (
      <button
        type="button"
        disabled={!tab || !onJump}
        onClick={() => tab && onJump?.(tab)}
        className="rounded-2xl border border-dashed border-stone-300/80 px-5 py-4 text-left transition enabled:hover:border-amber-400/60 disabled:opacity-60 dark:border-white/15"
      >
        <p className="text-xs text-stone-500 dark:text-slate-500">{role}</p>
        <p className="mt-0.5 text-sm font-semibold text-stone-500 dark:text-slate-500">
          Not appointed yet
        </p>
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-white/50 bg-white/55 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <p className="text-xs text-stone-500 dark:text-slate-500">{role}</p>
      <p className="mt-0.5 font-bold">{person.name}</p>
      {person.company && (
        <p className="text-sm text-stone-600 dark:text-slate-400">{person.company}</p>
      )}
    </div>
  );
}
