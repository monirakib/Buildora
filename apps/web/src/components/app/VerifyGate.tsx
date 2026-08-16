"use client";

import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { UserRole, VerificationStatus } from "@buildora/shared";
import { useSession } from "@/store/useSession";

/**
 * The client-side half of the verification gate.
 *
 * The API is the real gate — every guarded route runs `requireVerified` and
 * refuses with a 403 `NOT_VERIFIED` no matter what the browser does. This
 * exists so the person sees *why* the button won't work before they press it,
 * and gets a link to the thing that fixes it.
 *
 * The rule everywhere is "you can look, you can't act": nothing here hides a
 * page or a listing. It replaces the one control that would have been refused.
 */

/** Whether the signed-in user has been approved by a supervisor. */
export function useIsVerified(): boolean {
  const user = useSession((s) => s.user);
  return user?.verificationStatus === VerificationStatus.APPROVED;
}

/**
 * The user's status, or null when nobody is signed in. Components that need to
 * tell "hasn't started" from "waiting on a supervisor" read this.
 */
export function useVerificationStatus(): VerificationStatus | null {
  const user = useSession((s) => s.user);
  return user?.verificationStatus ?? null;
}

function copyFor(status: VerificationStatus | null, action: string) {
  switch (status) {
    case VerificationStatus.DOCUMENTS_SUBMITTED:
    case VerificationStatus.UNDER_REVIEW:
      return {
        title: "Your documents are being reviewed",
        body: `A supervisor is checking them now. You'll be able to ${action} as soon as they're approved.`,
        cta: "Check progress",
      };
    case VerificationStatus.REJECTED:
      return {
        title: "Your verification wasn't approved",
        body: `Update the documents a supervisor flagged and submit again to ${action}.`,
        cta: "Fix and resubmit",
      };
    default:
      return {
        title: "Verify your account first",
        body: `Confirm your identity to ${action}. It takes a few minutes, then a supervisor reviews it.`,
        cta: "Start verification",
      };
  }
}

/**
 * A panel explaining why an action is unavailable, with a link to `/verify`.
 *
 * `action` completes the sentence "you'll be able to …", so pass a verb phrase:
 * "post this brief", "bid on tenders", "sign this inspection".
 */
export function VerifyNotice({ action, className = "" }: { action: string; className?: string }) {
  const status = useVerificationStatus();
  const copy = copyFor(status, action);
  const waiting =
    status === VerificationStatus.DOCUMENTS_SUBMITTED || status === VerificationStatus.UNDER_REVIEW;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        waiting ? "border-sky-500/30 bg-sky-500/10" : "border-amber-500/30 bg-amber-500/10"
      } ${className}`}
    >
      <p className="inline-flex items-center gap-2 text-sm font-bold text-stone-900 dark:text-white">
        {waiting ? (
          <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
        {copy.title}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.body}</p>
      <Link
        href="/verify"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-slate-200"
      >
        {copy.cta} →
      </Link>
    </div>
  );
}

/**
 * Shows `children` to a verified user, and the notice to everyone else.
 *
 * Wrap the control, not the content: an unverified land owner should still see
 * the whole brief form and the whole tender board — they just can't submit.
 */
export function VerifyGate({
  action,
  children,
  className,
}: {
  action: string;
  children: React.ReactNode;
  className?: string;
}) {
  const verified = useIsVerified();
  if (verified) return <>{children}</>;
  return <VerifyNotice action={action} className={className} />;
}

/**
 * The dashboard banner. Names what the account can't do yet, and — for land
 * owners — what it still can, because "you can't do anything" would be wrong
 * and would send people away rather than to the wizard.
 */
export function VerifyBanner({ role }: { role: UserRole }) {
  const status = useVerificationStatus();
  if (status === VerificationStatus.APPROVED || status === null) return null;

  const blocked =
    role === UserRole.LAND_OWNER
      ? "post briefs, hire professionals, run tenders or fund escrow"
      : role === UserRole.CONTRACTOR
        ? "bid on tenders, claim milestones or list products"
        : role === UserRole.SUPPLIER
          ? "list products in the marketplace"
          : role === UserRole.STRUCTURAL_ENGINEER
            ? "be appointed, submit drawings or sign milestone inspections"
            : "send proposals, publish your availability or deliver designs";

  const stillCan =
    role === UserRole.LAND_OWNER
      ? " You can still browse everything and order materials from the marketplace."
      : " You can still browse everything on the platform.";

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="inline-flex items-center gap-2 text-sm font-bold text-stone-900 dark:text-white">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        Your account isn&apos;t verified yet
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        Until a supervisor approves your documents you can&apos;t {blocked}.{stillCan}
      </p>
      <Link
        href="/verify"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-slate-200"
      >
        {status === VerificationStatus.PENDING_VERIFICATION
          ? "Start verification"
          : "Check progress"}{" "}
        →
      </Link>
    </div>
  );
}
