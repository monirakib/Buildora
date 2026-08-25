import { PERMIT_CHECKLISTS, type PermitDocument, type PermitType } from "@buildora/shared";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

/**
 * Reference-only document checklist for one permit type: which of RAJUK's
 * typically required documents this application has uploaded so far. This is
 * a progress aid, not a RAJUK submission or an official completeness check.
 */
export function PermitDocumentChecklist({
  permitType,
  documents,
}: {
  permitType: PermitType;
  documents: PermitDocument[];
}) {
  const items = PERMIT_CHECKLISTS[permitType];
  const uploadedKeys = new Set(documents.map((d) => d.key));
  const requiredItems = items.filter((item) => item.required);
  const doneCount = requiredItems.filter((item) => uploadedKeys.has(item.key)).length;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold tracking-tight">Document checklist</h3>
        <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">
          {doneCount} / {requiredItems.length} required documents
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{
            width: requiredItems.length
              ? `${Math.round((doneCount / requiredItems.length) * 100)}%`
              : "0%",
          }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => {
          const done = uploadedKeys.has(item.key);
          return (
            <li key={item.key} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : "bg-black/10 text-stone-500 dark:bg-white/10 dark:text-slate-400"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span>
                <span
                  className={
                    done
                      ? "text-stone-900 dark:text-slate-100"
                      : "text-stone-600 dark:text-slate-400"
                  }
                >
                  {item.label}
                </span>
                {!item.required && (
                  <span className="ml-1.5 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-stone-500 dark:bg-white/10 dark:text-slate-400">
                    if applicable
                  </span>
                )}
                {item.note && (
                  <span className="block text-xs text-stone-500 dark:text-slate-500">
                    {item.note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
        Reference guide only — confirm exact requirements with RAJUK/ECPS for your specific plot and
        building.
      </p>
    </div>
  );
}
