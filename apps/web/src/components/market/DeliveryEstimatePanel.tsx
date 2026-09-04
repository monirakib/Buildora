"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, Truck } from "lucide-react";
import type { DeliveryEstimate, Project } from "@buildora/shared";
import { listMyProjects } from "@/lib/apiProjects";
import { estimateDelivery } from "@/lib/apiEstimator";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/**
 * How far the stock has to travel, shown while the buyer is placing the order.
 *
 * Only projects with a map pin are offered: routing needs coordinates at both
 * ends, and a project without a pin has nothing to route to. Saying so plainly
 * is better than listing it and then failing.
 *
 * Every failure is reported as a sentence the buyer can act on — "this supplier
 * hasn't pinned their warehouse" is useful, a spinner that never resolves is not.
 */
export function DeliveryEstimatePanel({
  productId,
  token,
  /** Lets the modal pre-fill the delivery address from the chosen project. */
  onProjectPicked,
}: {
  productId: string;
  token: string;
  onProjectPicked?: (project: Project) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listMyProjects(token)
      // A project with no pin can't be routed to, so it isn't offered.
      .then((all) => setProjects(all.filter((p) => p.location?.lat && p.location?.lng)))
      .catch(() => setProjects([]));
  }, [token]);

  const run = useCallback(
    async (id: string) => {
      if (!id) {
        setEstimate(null);
        return;
      }
      setLoading(true);
      try {
        setEstimate(await estimateDelivery(token, productId, id));
      } catch {
        setEstimate({ unavailableReason: "Couldn't work out the distance just now" });
      } finally {
        setLoading(false);
      }
    },
    [token, productId]
  );

  // Nothing to offer, and nothing worth saying about it mid-checkout.
  if (projects.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-300/60 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
      <label className="text-sm">
        <span className="mb-1 flex items-center gap-1.5 font-semibold">
          <Truck className="h-4 w-4" /> Delivering to which project?
        </span>
        <select
          className={inputClass}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            const picked = projects.find((p) => p.id === e.target.value);
            if (picked) onProjectPicked?.(picked);
            run(e.target.value);
          }}
        >
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}, {p.areaName}
            </option>
          ))}
        </select>
      </label>

      {loading && (
        <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">Working out the route…</p>
      )}

      {!loading && estimate?.route && (
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-lg font-extrabold">{estimate.route.distanceKm} km</p>
          <p className="text-sm font-semibold text-stone-600 dark:text-slate-400">
            about {estimate.route.durationMin} min by road
          </p>
        </div>
      )}

      {!loading && estimate?.unavailableReason && (
        <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-stone-500 dark:text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {estimate.unavailableReason}
        </p>
      )}

      {!loading && estimate?.route && (
        <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-500">
          Driving distance from the supplier&apos;s warehouse to your plot. Actual delivery time
          depends on load and traffic.
        </p>
      )}
    </div>
  );
}
