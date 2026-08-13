"use client";

import { useEffect, useRef, useState } from "react";
import { KATHA_TO_SQM, type DapZone } from "@buildora/shared";
import { findDapZoneFor } from "@/lib/apiPermits";
import { landUseLabels, buildingTypeLabels } from "@/components/app/projectStatus";

/**
 * Tells a land owner which DAP zone their plot falls in and what that zone
 * allows, as soon as the area is known — picked on the map or typed by hand.
 *
 * Everything shown here comes from the admin-maintained zone table over the
 * API; the only arithmetic done in the browser is applying those limits to the
 * plot size and floor count already on the form.
 */

export interface DapZoneCardProps {
  /** Locality to look up, e.g. "Dhanmondi". */
  areaName: string;
  /** Plot size from the form, as the raw field string. */
  landAreaKatha: string;
  /** Planned floors from the form, as the raw field string. */
  floors: string;
  /** Planned building type, so we can flag a zone that doesn't allow it. */
  buildingType: string;
  /** Lets the page show the matched zone elsewhere, e.g. in the live preview. */
  onZone?: (zone: DapZone | null) => void;
}

const sqm = (n: number) => `${Math.round(n).toLocaleString("en-IN")} m²`;

export function DapZoneCard({
  areaName,
  landAreaKatha,
  floors,
  buildingType,
  onZone,
}: DapZoneCardProps) {
  const [zone, setZone] = useState<DapZone | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const area = areaName.trim();

  // Held in a ref so the effect below can stay keyed on the area alone. Pages
  // pass an inline arrow that changes identity every render, and depending on
  // it would restart the debounce timer forever.
  const onZoneRef = useRef(onZone);
  onZoneRef.current = onZone;

  // Debounced so typing an area by hand doesn't fire a request per keystroke.
  useEffect(() => {
    if (area.length < 2) {
      setZone(null);
      setChecked(false);
      onZoneRef.current?.(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await findDapZoneFor(area, controller.signal);
        setZone(found);
        setChecked(true);
        onZoneRef.current?.(found);
      } catch {
        // A failed or aborted lookup just leaves the card quiet — the owner can
        // still post the brief, and /permits is there for a manual check.
        setZone(null);
        setChecked(false);
        onZoneRef.current?.(null);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [area]);

  if (area.length < 2) return null;

  if (loading && !zone) {
    return (
      <p className="rounded-xl bg-stone-500/5 px-4 py-3 text-sm text-stone-500 dark:bg-white/5 dark:text-slate-400">
        Checking the DAP zone for {area}…
      </p>
    );
  }

  if (!zone) {
    return checked ? (
      <p className="rounded-xl bg-stone-500/5 px-4 py-3 text-sm text-stone-600 dark:bg-white/5 dark:text-slate-400">
        No DAP zone record covers “{area}” yet, so we can&apos;t show its limits. You can still post
        the brief,{" "}
        <a href="/permits" className="font-bold text-amber-600 hover:underline dark:text-amber-400">
          check the zone tools
        </a>{" "}
        or ask a supervisor to add the area.
      </p>
    ) : null;
  }

  const katha = Number(landAreaKatha) || 0;
  const plotSqm = katha * KATHA_TO_SQM;
  // FAR is the multiple of the plot area you may build in total; ground
  // coverage caps how much of the plot the building may sit on.
  const maxFloorAreaSqm = katha > 0 ? zone.maxFar * plotSqm : null;
  const maxFootprintSqm = katha > 0 ? (zone.maxGroundCoveragePct / 100) * plotSqm : null;

  const wantedFloors = Number(floors) || 0;
  const overFloorLimit = !!zone.maxFloors && wantedFloors > zone.maxFloors;
  // Splitting the allowance across the planned floors is the number that
  // actually shapes the design.
  const perFloorSqm =
    maxFloorAreaSqm != null && wantedFloors > 0 ? maxFloorAreaSqm / wantedFloors : null;

  // A commercial building in a residential zone needs a change of use, so say so.
  const useMismatch = !!buildingType && buildingType !== zone.landUse;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          Your plot falls under DAP zone{" "}
          <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs font-extrabold dark:bg-white/15">
            {zone.zoneCode}
          </span>{" "}
          <span className="font-semibold text-stone-600 dark:text-slate-300">
            ({zone.areaName})
          </span>
        </p>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
          {landUseLabels[zone.landUse] ?? zone.landUse}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-400">Max FAR</dt>
          <dd className="mt-0.5 font-bold">{zone.maxFar}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-400">Ground coverage</dt>
          <dd className="mt-0.5 font-bold">{zone.maxGroundCoveragePct}%</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500 dark:text-slate-400">Max floors</dt>
          <dd className="mt-0.5 font-bold">{zone.maxFloors ?? "-"}</dd>
        </div>
      </dl>

      {maxFloorAreaSqm != null && maxFootprintSqm != null && (
        <p className="mt-3 text-sm text-stone-700 dark:text-slate-300">
          {`On ${katha} katha (${sqm(plotSqm)}) this zone allows up to `}
          <strong>{sqm(maxFloorAreaSqm)}</strong>
          {` of total floor area, sitting on at most `}
          <strong>{sqm(maxFootprintSqm)}</strong>
          {` of the plot.`}
          {perFloorSqm != null &&
            ` Across ${wantedFloors} floors that averages ${sqm(perFloorSqm)} per floor.`}
        </p>
      )}

      {overFloorLimit && (
        <p className="mt-2.5 rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
          {`You've planned ${wantedFloors} floors, but ${zone.zoneCode} allows at most ${zone.maxFloors}. RAJUK would refuse this as it stands.`}
        </p>
      )}

      {useMismatch && (
        <p className="mt-2.5 text-xs font-semibold text-stone-600 dark:text-slate-300">
          {`This zone is marked ${(landUseLabels[zone.landUse] ?? zone.landUse).toLowerCase()}, but you've chosen a ${(buildingTypeLabels[buildingType] ?? buildingType).toLowerCase()} building, that needs a change-of-use approval.`}
        </p>
      )}

      {zone.notes && (
        <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">{zone.notes}</p>
      )}

      <p className="mt-2.5 text-xs text-stone-500 dark:text-slate-400">
        Guidance only. RAJUK decides. See the{" "}
        <a href="/permits" className="font-bold text-amber-600 hover:underline dark:text-amber-400">
          permit tools
        </a>{" "}
        for fees and the ECPS steps.
      </p>
    </div>
  );
}
