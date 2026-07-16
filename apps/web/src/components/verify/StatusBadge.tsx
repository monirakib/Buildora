"use client";

import { motion } from "motion/react";
import { BadgeCheck, FileCheck2, PencilLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { VerificationStatus } from "@buildora/shared";

// The four stages of the verification journey, in order. REJECTED is shown
// separately — it sends the architect back to the editable draft state.
const STAGES = [
  { status: VerificationStatus.PENDING_VERIFICATION, label: "Draft", icon: PencilLine },
  { status: VerificationStatus.DOCUMENTS_SUBMITTED, label: "Documents Submitted", icon: FileCheck2 },
  { status: VerificationStatus.UNDER_REVIEW, label: "Supervisor Review", icon: ShieldCheck },
  { status: VerificationStatus.APPROVED, label: "Verified Architect", icon: BadgeCheck },
];

/** Animated pipeline badge: Draft → Submitted → Review → Verified. */
export function StatusBadge({ status }: { status: VerificationStatus }) {
  if (status === VerificationStatus.REJECTED) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
        <ShieldAlert className="h-3.5 w-3.5" /> Rejected — update and resubmit
      </span>
    );
  }

  const activeIndex = STAGES.findIndex((s) => s.status === status);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const reached = i <= activeIndex;
        const isActive = i === activeIndex;
        return (
          <div key={stage.status} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className={`h-px w-4 ${reached ? "bg-[#F5B400]/60" : "bg-white/50 dark:bg-white/10"}`} />
            )}
            <motion.span
              // The active stage pulses in when the status changes.
              initial={false}
              animate={isActive ? { scale: [0.9, 1.05, 1] } : { scale: 1 }}
              transition={{ duration: 0.4 }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                isActive && stage.status === VerificationStatus.APPROVED
                  ? "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 backdrop-blur-xl"
                  : isActive
                    ? "bg-[#F5B400]/20 text-amber-600 dark:text-[#F5B400] backdrop-blur-xl"
                    : reached
                      ? "bg-white/70 dark:bg-white/[0.14] text-stone-800 dark:text-slate-200 backdrop-blur-xl"
                      : "bg-white/40 dark:bg-white/[0.07] text-stone-600 dark:text-slate-400 backdrop-blur-xl"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {stage.label}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}
