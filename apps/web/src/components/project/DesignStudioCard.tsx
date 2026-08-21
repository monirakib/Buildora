"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Ruler } from "lucide-react";
import type { PlanCompliance, Project } from "@buildora/shared";
import { listFloorPlans } from "@/lib/apiFloorPlans";

/**
 * The project page's doorway into the 3D Design Studio, and the home of the
 * DAP compliance readout.
 *
 * The studio itself is a full-screen tool on its own route, deliberately
 * showing nothing but the drawing — no FAR figure, no zone limits, nothing of
 * Buildora's chrome. That is what keeps it the tool it is, but the compliance
 * check still has to live somewhere a land owner will see it, so it lives here:
 * measured from the floor plans the studio mirrors into on every save.
 *
 * Every number below is computed by the API from the drawn rooms against the
 * admin-maintained DAP zone table. Nothing about FAR or ground coverage is
 * worked out in the browser, and nothing about it is hardcoded.
 */
export function DesignStudioCard({ project, token }: { project: Project; token: string }) {
  const [compliance, setCompliance] = useState<PlanCompliance | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await listFloorPlans(token, project.id);
      setCompliance(result.compliance);
      setCanEdit(result.canEdit);
    } catch {
      // A failed check leaves the card showing the studio link alone. Not being
      // able to quote a FAR is no reason to hide the way in to the drawing.
      setCompliance(null);
    } finally {
      setLoading(false);
    }
  }, [token, project.id]);

  useEffect(() => {
    load();
  }, [load]);

  const drawn = (compliance?.floorsDrawn ?? 0) > 0;

  return (
    <section className="rounded-3xl border border-white/40 bg-white/60 p-6 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight">Design Studio</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            Draw the building in 2D and 3D — walls, doors, windows, stairs, furniture and finishes.
          </p>
        </div>
        <Link
          href={`/projects/${project.id}/studio`}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-stone-700 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
        >
          {canEdit ? "Open Design Studio" : "View the design"}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-stone-500 dark:text-slate-400">Checking the drawing…</p>
      ) : !drawn ? (
        <p className="mt-5 rounded-xl bg-stone-500/5 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-slate-400">
          Nothing has been drawn yet. {canEdit ? "Open the studio to start the layout." : ""}
        </p>
      ) : (
        compliance && <ComplianceReadout compliance={compliance} />
      )}
    </section>
  );
}

/** The FAR and ground-coverage figures, measured against the plot's DAP zone. */
function ComplianceReadout({ compliance }: { compliance: PlanCompliance }) {
  const over = compliance.verdict === "over";
  const noZone = compliance.verdict === "no-zone";

  return (
    <div className="mt-5 space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Floors drawn" value={String(compliance.floorsDrawn)} />
        <Figure label="Built area" value={`${round(compliance.totalBuiltAreaSqft)} ft²`} />
        <Figure
          label="FAR"
          value={String(compliance.far)}
          limit={compliance.maxFar !== undefined ? `of ${compliance.maxFar}` : undefined}
        />
        <Figure
          label="Ground coverage"
          value={`${compliance.groundCoveragePct}%`}
          limit={
            compliance.maxGroundCoveragePct !== undefined
              ? `of ${compliance.maxGroundCoveragePct}%`
              : undefined
          }
        />
      </dl>

      {noZone ? (
        <p className="flex items-start gap-2 rounded-xl bg-stone-500/5 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-slate-400">
          <Ruler className="mt-0.5 h-4 w-4 shrink-0" />
          No DAP zone record covers this area yet, so these figures have nothing to be checked
          against.
        </p>
      ) : over ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> Over the limits for zone {compliance.zoneCode}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-red-700/90 dark:text-red-200/90">
            {compliance.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Within the limits for zone {compliance.zoneCode}
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, limit }: { label: string; value: string; limit?: string }) {
  return (
    <div className="rounded-2xl bg-stone-500/5 px-4 py-3 dark:bg-white/5">
      <dt className="text-xs font-bold text-stone-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-black tracking-tight">
        {value}
        {limit && (
          <span className="ml-1.5 text-xs font-bold text-stone-500 dark:text-slate-400">
            {limit}
          </span>
        )}
      </dd>
    </div>
  );
}

const round = (n: number) => Math.round(n).toLocaleString("en-IN");
