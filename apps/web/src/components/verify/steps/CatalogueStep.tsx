"use client";
import { ProductCategory } from "@buildora/shared";
import { ChipGroup, Field, StepHeader, addButton, entryBox, input, removeButton } from "../ui";
import { UploadZone } from "../UploadZone";
import { emptyBrandAuthorization, type StepProps } from "../form";

/** "SAND_AGGREGATE" → "Sand & aggregate" — the enum, read by a human. */
const CATEGORY_LABELS: Record<string, string> = {
  [ProductCategory.CEMENT]: "Cement",
  [ProductCategory.STEEL]: "Steel / rod",
  [ProductCategory.BRICKS]: "Bricks",
  [ProductCategory.SAND_AGGREGATE]: "Sand & aggregate",
  [ProductCategory.TILES]: "Tiles",
  [ProductCategory.PAINT]: "Paint",
  [ProductCategory.ELECTRICAL]: "Electrical",
  [ProductCategory.PLUMBING]: "Plumbing",
  [ProductCategory.WOOD]: "Wood",
  [ProductCategory.OTHER]: "Other",
};

const CATEGORY_VALUES = Object.values(ProductCategory);
const CATEGORY_OPTIONS = CATEGORY_VALUES.map((c) => CATEGORY_LABELS[c] ?? c);

/**
 * What the supplier actually stocks.
 *
 * The categories are the ProductCategory enum rather than free text, so a
 * verified supplier's declared lines and their marketplace listings speak the
 * same vocabulary — a supervisor approving "Cement" is approving the category
 * their listings will appear under.
 *
 * Brand authorisation is separate and optional because "sells Shah Cement" and
 * "is an authorised Shah Cement dealer" are different claims, and only the
 * second one comes with a letter.
 */
export function CatalogueStep({ form, patch, onError }: StepProps) {
  // Chips are shown as labels but stored as enum values, so both directions go
  // through the same index lookup.
  const selectedLabels = form.supplyCategories
    .map((value) => CATEGORY_LABELS[value] ?? value)
    .filter(Boolean);

  function toggleCategory(chosenLabel: string) {
    const index = CATEGORY_OPTIONS.indexOf(chosenLabel);
    const value = CATEGORY_VALUES[index];
    if (!value) return;
    patch({
      supplyCategories: form.supplyCategories.includes(value)
        ? form.supplyCategories.filter((c) => c !== value)
        : [...form.supplyCategories, value],
    });
  }

  function setBrand(index: number, partial: Partial<(typeof form.brandAuthorizations)[number]>) {
    patch({
      brandAuthorizations: form.brandAuthorizations.map((b, i) =>
        i === index ? { ...b, ...partial } : b
      ),
    });
  }

  return (
    <div>
      <StepHeader
        title="Material Catalogue"
        subtitle="The lines you stock, and the brands you're authorised to sell."
      />

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-3 text-sm font-semibold text-stone-900 dark:text-slate-100">
            Material categories <span className="text-amber-700 dark:text-[#F5B400]">*</span>
          </p>
          <ChipGroup
            options={CATEGORY_OPTIONS}
            selected={selectedLabels}
            onToggle={toggleCategory}
          />
          <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
            {form.supplyCategories.length} selected, your marketplace listings appear under these.
          </p>
        </div>

        {/* ---- Brand authorisations ---- */}
        <div className="border-t border-white/40 pt-5 dark:border-white/8">
          <p className="text-sm font-bold text-stone-700 dark:text-slate-300">
            Brand authorisation (optional)
          </p>
          <p className="mt-1 mb-4 text-xs text-stone-500 dark:text-slate-500">
            Add a dealership letter for each brand you&apos;re an authorised seller of. Leave this
            empty if you re-sell without a dealership, buyers see the difference.
          </p>

          <div className="flex flex-col gap-4">
            {form.brandAuthorizations.map((brand, i) => (
              <div key={i} className={entryBox}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-stone-900 dark:text-slate-100">
                    Brand {i + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        brandAuthorizations: form.brandAuthorizations.filter((_, j) => j !== i),
                      })
                    }
                    className={removeButton}
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid items-start gap-4 sm:grid-cols-2">
                  <Field id={`brand-${i}`} title="Brand">
                    <input
                      id={`brand-${i}`}
                      type="text"
                      placeholder="e.g. Shah Cement, BSRM"
                      value={brand.brand}
                      onChange={(e) => setBrand(i, { brand: e.target.value })}
                      className={input}
                    />
                  </Field>
                  <Field id={`brandValid-${i}`} title="Authorisation valid until">
                    <input
                      id={`brandValid-${i}`}
                      type="date"
                      value={brand.validTill}
                      onChange={(e) => setBrand(i, { validTill: e.target.value })}
                      className={input}
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <UploadZone
                    title="Dealership letter"
                    compact
                    value={brand.documentUrl}
                    onChange={(url) => setBrand(i, { documentUrl: url })}
                    onError={onError}
                  />
                </div>
              </div>
            ))}

            {form.brandAuthorizations.length < 20 && (
              <button
                type="button"
                onClick={() =>
                  patch({
                    brandAuthorizations: [
                      ...form.brandAuthorizations,
                      { ...emptyBrandAuthorization },
                    ],
                  })
                }
                className={addButton}
              >
                + Add brand
              </button>
            )}
          </div>
        </div>

        {/* ---- BSTI ---- */}
        <div className="border-t border-white/40 pt-5 dark:border-white/8">
          <p className="text-sm font-bold text-stone-700 dark:text-slate-300">
            BSTI licence (optional)
          </p>
          <p className="mt-1 mb-4 text-xs text-stone-500 dark:text-slate-500">
            Required by law for some materials, cement, rod and tiles among them. Add it if you
            manufacture or import any of them.
          </p>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Field id="bstiLicenseNo" title="BSTI licence number">
              <input
                id="bstiLicenseNo"
                type="text"
                value={form.bstiLicenseNo}
                onChange={(e) => patch({ bstiLicenseNo: e.target.value })}
                className={input}
              />
            </Field>
            <UploadZone
              title="BSTI certificate"
              compact
              value={form.bstiCertificateUrl}
              onChange={(url) => patch({ bstiCertificateUrl: url })}
              onError={onError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
