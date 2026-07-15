import { VerificationStatus } from "@buildora/shared";

/**
 * "Platform Verified" pill, shown only on APPROVED professionals. Nobody is
 * approved until verification review ships, so this stays hidden for now — but
 * the directory is already wired to surface it the moment a review happens.
 */
export function VerifiedBadge({ status }: { status: VerificationStatus }) {
  if (status !== VerificationStatus.APPROVED) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      Platform Verified
    </span>
  );
}

/** Small neutral pill for accounts still going through verification. */
export function PendingBadge({ status }: { status: VerificationStatus }) {
  if (status === VerificationStatus.APPROVED) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-white/10 dark:text-slate-400">
      Verification pending
    </span>
  );
}
