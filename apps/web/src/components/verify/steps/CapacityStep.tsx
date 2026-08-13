"use client";
import { CONTRACTOR_CLASSES, ENLISTMENT_BODIES, EQUIPMENT_OPTIONS } from "@buildora/shared";
import { ChipGroup, Field, StepHeader, input } from "../ui";
import { UploadZone } from "../UploadZone";
import type { StepProps } from "../form";

/**
 * What the contractor can actually take on: their enlistment class, their crew,
 * and the plant they own.
 *
 * None of it is mandatory — an unenlisted firm with three masons is still a real
 * contractor. It exists because this is exactly what a land owner weighs when
 * comparing sealed bids, and a verified capacity claim is worth more than one
 * typed into a bid form.
 */
export function CapacityStep({ form, patch, onError }: StepProps) {
  function toggleEquipment(item: string) {
    patch({
      equipment: form.equipment.includes(item)
        ? form.equipment.filter((e) => e !== item)
        : [...form.equipment, item],
    });
  }

  return (
    <div>
      <StepHeader
        title="Enlistment & Capacity"
        subtitle="Your contractor class, permanent crew and plant, what land owners compare when awarding a tender."
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="enlistmentBody"
            title="Enlisted with"
            hint="The body that graded your firm, if any."
          >
            <select
              id="enlistmentBody"
              value={form.enlistmentBody}
              onChange={(e) => patch({ enlistmentBody: e.target.value })}
              className={input}
            >
              <option value="">Not enlisted</option>
              {ENLISTMENT_BODIES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="contractorClass"
            title="Enlistment class"
            hint="Your class caps the contract value you may tender for."
          >
            <select
              id="contractorClass"
              value={form.contractorClass}
              onChange={(e) => patch({ contractorClass: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              {CONTRACTOR_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="crewSize"
            title="Permanent crew size"
            hint="People on your own payroll, not sub-contracted labour."
          >
            <input
              id="crewSize"
              type="number"
              min={0}
              max={100000}
              value={form.crewSize}
              onChange={(e) => patch({ crewSize: e.target.value })}
              className={input}
            />
          </Field>
          <Field
            id="largestProjectBdt"
            title="Largest completed contract (BDT)"
            hint="The biggest single build you've finished."
          >
            <input
              id="largestProjectBdt"
              type="number"
              min={0}
              value={form.largestProjectBdt}
              onChange={(e) => patch({ largestProjectBdt: e.target.value })}
              className={input}
            />
          </Field>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-stone-900 dark:text-slate-100">
            Equipment owned
          </p>
          <ChipGroup
            options={EQUIPMENT_OPTIONS}
            selected={form.equipment}
            onToggle={toggleEquipment}
          />
          <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
            {form.equipment.length} selected, pick only what your firm owns or holds on a standing
            hire.
          </p>
        </div>

        <div className="mt-2 grid items-start gap-5 border-t border-white/40 pt-5 sm:grid-cols-2 dark:border-white/8">
          <UploadZone
            title="Enlistment certificate"
            value={form.enlistmentCertificateUrl}
            onChange={(url) => patch({ enlistmentCertificateUrl: url })}
            onError={onError}
          />
          {/* Evidence the firm can carry a build's cash flow between escrow
              releases — a supervisor's strongest signal on a large tender. */}
          <UploadZone
            title="Bank solvency certificate"
            value={form.bankSolvencyUrl}
            onChange={(url) => patch({ bankSolvencyUrl: url })}
            onError={onError}
          />
        </div>
      </div>
    </div>
  );
}
