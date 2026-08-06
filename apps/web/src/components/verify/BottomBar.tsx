"use client";

import { useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useHoverScale } from "@/lib/useHoverScale";

/**
 * Fixed liquid-glass action bar: save state on the left, completion in the
 * middle, submit on the right. Submit stays disabled until every mandatory
 * item is done (the API enforces the same rule server-side).
 */
export function BottomBar({
  saveState,
  onSaveDraft,
  percent,
  canSubmit,
  submitting,
  onSubmit,
  locked,
}: {
  saveState: "idle" | "saving" | "saved" | "error";
  onSaveDraft: () => void;
  percent: number;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  /** True while under review / verified — hides the actions entirely. */
  locked: boolean;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);

  const saveRef = useHoverScale<HTMLButtonElement>({ enabled: saveState !== "saving" });
  const submitRef = useHoverScale<HTMLButtonElement>({
    hover: 1.05,
    tap: 0.95,
    enabled: canSubmit && !submitting,
  });

  // The filled portion eases to its new width whenever completion changes.
  useGSAP(
    () => {
      const fill = fillRef.current;
      if (!fill) return;
      gsap.to(fill, {
        width: `${percent}%`,
        duration: prefersReducedMotion() ? 0 : 0.8,
        ease: "power3.out",
        overwrite: "auto",
      });
    },
    { dependencies: [percent] }
  );

  // A soft highlight sweeping along the filled bar, on a loop.
  useGSAP(() => {
    const shimmer = shimmerRef.current;
    if (!shimmer || prefersReducedMotion()) return;
    gsap.fromTo(
      shimmer,
      { xPercent: -120 },
      {
        xPercent: 600,
        duration: 2.4,
        ease: "sine.inOut",
        repeat: -1,
        // Beat between sweeps, so it reads as a pulse rather than a conveyor.
        repeatDelay: 1,
      }
    );
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="relative mx-auto flex max-w-5xl items-center gap-4 overflow-hidden rounded-[26px] border border-white/60 dark:border-white/[0.16] bg-white/60 dark:bg-white/[0.09] px-5 py-3.5 shadow-[0_16px_60px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_16px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[44px] backdrop-saturate-[1.8]">
        {/* Top sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/60 dark:from-white/[0.12] to-transparent"
        />

        {/* Left — save draft */}
        {!locked && (
          <button
            ref={saveRef}
            type="button"
            onClick={onSaveDraft}
            disabled={saveState === "saving"}
            className="relative shrink-0 rounded-full border border-white/60 dark:border-white/[0.18] bg-white/50 dark:bg-white/[0.10] px-4 py-2 text-xs font-bold text-stone-900 dark:text-white transition-colors hover:border-stone-400 dark:hover:border-white/35 disabled:opacity-50 sm:px-5 sm:text-sm"
          >
            {saveState === "saving" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            ) : saveState === "saved" ? (
              "Saved ✓"
            ) : (
              "Save Draft"
            )}
          </button>
        )}

        {/* Center — completion */}
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-stone-600 dark:text-slate-400">Profile completion</span>
            <span className="text-amber-600 dark:text-[#F5B400]">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-900/10 dark:bg-white/10">
            <div
              ref={fillRef}
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#F5B400] to-amber-300"
              style={{ width: 0 }}
            >
              <div
                ref={shimmerRef}
                aria-hidden
                className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              />
            </div>
          </div>
        </div>

        {/* Right — submit */}
        {!locked && (
          <button
            ref={submitRef}
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            title={canSubmit ? undefined : "Complete all mandatory items first"}
            className="relative shrink-0 rounded-full bg-[#F5B400] px-4 py-2.5 text-xs font-bold text-slate-950 shadow-[0_4px_24px_rgba(245,180,0,0.4)] transition-colors hover:bg-amber-300 disabled:opacity-40 disabled:shadow-none sm:px-6 sm:text-sm"
          >
            <span className="inline-flex items-center gap-1.5">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Submit for Verification</span>
              <span className="sm:hidden">Submit</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
