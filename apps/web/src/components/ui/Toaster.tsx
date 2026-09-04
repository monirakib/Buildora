"use client";

import { Check, Info, X } from "lucide-react";
import { useToast } from "@/store/useToast";

/**
 * Draws the global toast stack, bottom-right (full width on a phone).
 * Mounted once in the root layout. The entrance/exit motion is the
 * `.toast-item` rule in globals.css.
 */
export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-70 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-leaving={t.leaving ? "true" : undefined}
          className={`toast-item pointer-events-auto flex w-full items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl sm:w-auto sm:max-w-sm ${
            t.tone === "error"
              ? "bg-rose-600 text-white"
              : "bg-stone-900 text-white dark:bg-white dark:text-stone-950"
          }`}
        >
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
              t.tone === "success"
                ? "bg-emerald-400 text-stone-950"
                : t.tone === "error"
                  ? "bg-white/20"
                  : "bg-sky-400 text-stone-950"
            }`}
          >
            {t.tone === "error" ? <Info className="h-3.5 w-3.5" /> : <Check className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold transition hover:bg-white/25 dark:bg-stone-950/10 dark:hover:bg-stone-950/20"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 transition hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
