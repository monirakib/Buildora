"use client";

import { PHASE_LABELS, type ProjectProgressResult, type PhaseKey } from "./phases";

/**
 * The universal progress bar.
 *
 * One track split into the four phases, each segment as wide as that phase is
 * worth of the whole build (design 25, structural 15, permit 15, construction
 * 45). A segment fills by how much of its own work is genuinely done, so you can
 * see both where the project is and how much of the road is left.
 */
export function ProjectProgress({
  progress,
  onJump,
}: {
  progress: ProjectProgressResult;
  /** Clicking a segment opens that phase's tab. */
  onJump: (phase: PhaseKey) => void;
}) {
  const phases = Object.values(progress.phases);
  const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
          Overall progress
        </p>
        <p className="text-sm font-extrabold">
          {progress.percent}
          <span className="text-stone-500 dark:text-slate-500">%</span>
        </p>
      </div>

      {/* One flex row of segments, sized by weight. gap-1 leaves a hairline
          between phases so the four are readable as four. */}
      <div className="mt-2 flex gap-1">
        {phases.map((phase) => (
          <button
            key={phase.key}
            type="button"
            onClick={() => onJump(phase.key)}
            style={{ flexGrow: phase.weight, flexBasis: 0 }}
            title={`${PHASE_LABELS[phase.key]}, ${Math.round(phase.fraction * 100)}%`}
            aria-label={`${PHASE_LABELS[phase.key]}, ${Math.round(phase.fraction * 100)} percent complete`}
            className="group relative h-2.5 overflow-hidden rounded-full bg-black/10 transition hover:h-3 dark:bg-white/10"
          >
            <span
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                phase.fraction >= 1
                  ? "bg-emerald-500"
                  : phase.unlocked
                    ? "bg-amber-400"
                    : "bg-stone-400/50 dark:bg-white/20"
              }`}
              style={{ width: `${Math.round(phase.fraction * 100)}%` }}
            />
          </button>
        ))}
      </div>

      {/* Legend — the four phases with their own percentage, which is also the
          answer to "why is the bar only at 42%". */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {phases.map((phase) => (
          <button
            key={phase.key}
            type="button"
            onClick={() => onJump(phase.key)}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 transition hover:text-stone-800 dark:text-slate-500 dark:hover:text-slate-200"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                phase.fraction >= 1
                  ? "bg-emerald-500"
                  : phase.unlocked
                    ? "bg-amber-400"
                    : "bg-stone-400/50 dark:bg-white/20"
              }`}
            />
            {PHASE_LABELS[phase.key]}
            <span className="text-stone-400 dark:text-slate-600">
              {Math.round(phase.fraction * 100)}%
            </span>
            <span className="text-stone-400 dark:text-slate-600">
              ({Math.round((phase.weight / totalWeight) * 100)}% of build)
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
