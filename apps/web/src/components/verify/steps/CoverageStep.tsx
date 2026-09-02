"use client";
import { useState } from "react";
import { BD_DISTRICTS, BD_DIVISIONS, type BdDivision } from "@buildora/shared";
import { ChipGroup, Field, StepHeader, input } from "../ui";
import { PlotMapPicker } from "@/components/project/PlotMapPicker";
import type { StepProps } from "../form";

/**
 * Where the supplier's stock is and how far it travels.
 *
 * Delivery districts are picked one division at a time rather than as one flat
 * list of 64 chips — a supplier who delivers across Dhaka division shouldn't
 * have to hunt through Sylhet's districts to find them.
 */
export function CoverageStep({ form, patch }: StepProps) {
  const [division, setDivision] = useState<string>(BD_DIVISIONS[0]);
  const districts = BD_DISTRICTS[division as BdDivision] ?? [];

  function toggleDistrict(name: string) {
    patch({
      deliveryDistricts: form.deliveryDistricts.includes(name)
        ? form.deliveryDistricts.filter((d) => d !== name)
        : [...form.deliveryDistricts, name],
    });
  }

  /** Select or clear every district in the division on screen. */
  function toggleWholeDivision() {
    const allSelected = districts.every((d) => form.deliveryDistricts.includes(d));
    patch({
      deliveryDistricts: allSelected
        ? form.deliveryDistricts.filter((d) => !districts.includes(d))
        : [...new Set([...form.deliveryDistricts, ...districts])],
    });
  }

  const allSelected =
    districts.length > 0 && districts.every((d) => form.deliveryDistricts.includes(d));

  return (
    <div>
      <StepHeader
        title="Warehouse & Delivery"
        subtitle="Where your stock actually sits, and how far you deliver."
      />

      <div className="flex flex-col gap-6">
        <Field
          id="warehouseAddress"
          title="Warehouse / outlet address"
          required
          hint="The address a supervisor could visit. Not shown publicly, buyers see your district only."
        >
          <textarea
            id="warehouseAddress"
            rows={3}
            maxLength={300}
            value={form.warehouseAddress}
            onChange={(e) => patch({ warehouseAddress: e.target.value })}
            className={input}
          />
        </Field>

        {/* The warehouse pin. Delivery routing works in coordinates, and
            Bangladeshi street addresses geocode badly enough that guessing from
            the text above would hand buyers confidently wrong ETAs. */}
        <Field
          id="warehouseLocation"
          title="Pin the warehouse on the map"
          hint="Buyers see the driving distance and ETA from this pin to their build site."
        >
          <PlotMapPicker
            value={
              form.warehouseLocation
                ? { lat: form.warehouseLocation.lat, lng: form.warehouseLocation.lng }
                : null
            }
            onChange={(picked) =>
              patch({
                warehouseLocation: picked ? { lat: picked.lat, lng: picked.lng } : null,
              })
            }
          />
        </Field>

        <div className="border-t border-white/40 pt-5 dark:border-white/8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                Delivery districts
              </p>
              <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                {form.deliveryDistricts.length} selected across the country.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleWholeDivision}
              className="rounded-full border border-white/60 bg-white/50 px-4 py-1.5 text-xs font-bold text-stone-700 backdrop-blur-xl transition hover:border-[#F5B400]/60 hover:text-amber-700 dark:border-white/[0.18] dark:bg-white/[0.10] dark:text-slate-300 dark:hover:text-[#F5B400]"
            >
              {allSelected ? `Clear ${division}` : `Select all of ${division}`}
            </button>
          </div>

          {/* Division picker — a row of tabs, not a select, so the districts
              below re-render as soon as one is tapped. */}
          <div className="mb-4 flex flex-wrap gap-2">
            {BD_DIVISIONS.map((d) => {
              const count = (BD_DISTRICTS[d] ?? []).filter((district) =>
                form.deliveryDistricts.includes(district)
              ).length;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDivision(d)}
                  aria-pressed={division === d}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    division === d
                      ? "bg-stone-900 text-white dark:bg-[#F5B400] dark:text-slate-950"
                      : "border border-white/60 bg-white/50 text-stone-600 backdrop-blur-xl hover:text-stone-900 dark:border-white/[0.18] dark:bg-white/[0.08] dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {d}
                  {count > 0 && <span className="ml-1.5 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          <ChipGroup
            options={districts}
            selected={form.deliveryDistricts}
            onToggle={toggleDistrict}
          />
        </div>
      </div>
    </div>
  );
}
