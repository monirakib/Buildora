"use client";

import { useRef } from "react";
import { BadgeCheck, FileCheck2, PencilLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { UserRole, VerificationStatus } from "@buildora/shared";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { wizardFor } from "./roles";

// The four stages of the verification journey, in order. REJECTED is shown
// separately — it sends the applicant back to the editable draft state.
//
// The final label depends on the role: this used to read "Verified Architect"
// for everyone, which was already wrong for the three other professions and
// would be nonsense for a land owner. It comes from the same role table the
// wizard reads.
function stagesFor(role: UserRole) {
  return [
    { status: VerificationStatus.PENDING_VERIFICATION, label: "Draft", icon: PencilLine },
    {
      status: VerificationStatus.DOCUMENTS_SUBMITTED,
      label: "Documents Submitted",
      icon: FileCheck2,
    },
    { status: VerificationStatus.UNDER_REVIEW, label: "Supervisor Review", icon: ShieldCheck },
    {
      status: VerificationStatus.APPROVED,
      // Roles with no wizard (admin, key custodian) never reach this screen;
      // the fallback only keeps the badge readable if one somehow does.
      label: wizardFor(role)?.verifiedLabel ?? "Verified",
      icon: BadgeCheck,
    },
  ];
}

/** Animated pipeline badge: Draft → Submitted → Review → Verified. */
export function StatusBadge({ status, role }: { status: VerificationStatus; role: UserRole }) {
  const STAGES = stagesFor(role);

  // Hooks must run on every render, so they sit above the REJECTED early
  // return below — the ref is simply null in that branch.
  const activeRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = activeRef.current;
      if (!el || prefersReducedMotion()) return;

      // The stage the profile just reached pops in. `back.out` overshoots
      // slightly before settling, which is what the old 0.9→1.05→1 keyframes
      // were imitating by hand.
      gsap.fromTo(
        el,
        { scale: 0.9 },
        { scale: 1, duration: 0.4, ease: "back.out(3)", clearProps: "transform" }
      );
    },
    { dependencies: [status] }
  );

  if (status === VerificationStatus.REJECTED) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
        <ShieldAlert className="h-3.5 w-3.5" /> Rejected, update and resubmit
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
              <span
                className={`h-px w-4 ${reached ? "bg-[#F5B400]/60" : "bg-white/50 dark:bg-white/10"}`}
              />
            )}
            <span
              // Only the active stage gets the ref, so only it pulses when
              // the status changes.
              ref={isActive ? activeRef : undefined}
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
            </span>
          </div>
        );
      })}
    </div>
  );
}
