"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Loader2,
  Search,
  ShieldAlert,
  UserX,
  XCircle,
} from "lucide-react";
import { iabNameMatches, type IabCheck, type IabMember } from "@buildora/shared";
import { checkIabMembership } from "@/lib/api";

/**
 * IAB membership number with a button that looks it up in the Institute of
 * Architects Bangladesh directory.
 *
 * Used by both the signup form and the verification wizard, which want
 * different things from the result — signup fills the name in from the
 * directory, the wizard must not (overwriting the account name there would
 * quietly defeat the mismatch check that blocks submission). So this component
 * only reports; `onResult` decides what gets written.
 *
 * Nothing shown here is trusted. The API repeats the lookup when the profile is
 * submitted and stores that result for the supervisor.
 */
export function IabCheckField({
  value,
  onChange,
  accountName,
  onResult,
  token,
  inputClass,
  labelClass,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Name currently on the form/account — compared against the IAB record. */
  accountName: string;
  /** Called on a successful lookup so the caller can fill its own fields. */
  onResult?: (member: IabMember) => void;
  /** Present in the wizard; omitted at signup, which has no session yet. */
  token?: string;
  inputClass: string;
  labelClass: string;
}) {
  const [check, setCheck] = useState<IabCheck | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A result belongs to the number it was fetched for — drop it the moment the
  // number is edited, so a green badge can't sit under a different one.
  useEffect(() => {
    setCheck(null);
    setError("");
  }, [value]);

  async function runCheck() {
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await checkIabMembership(value, { token, name: accountName });
      setCheck(result);
      if (result.member) onResult?.(result.member);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor="licenseNumber" className={labelClass}>
        IAB Membership Number
      </label>
      <div className="flex gap-2">
        <input
          id="licenseNumber"
          type="text"
          value={value}
          placeholder="AA-920"
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          onClick={runCheck}
          disabled={busy || !value.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/60 bg-white/50 px-4 text-sm font-bold text-stone-900 backdrop-blur-xl transition-[color,border-color,scale] duration-200 ease-out hover:border-[#F5B400]/60 hover:text-amber-700 disabled:opacity-50 dark:border-white/[0.18] dark:bg-white/[0.10] dark:text-white dark:hover:text-[#F5B400]"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {busy ? "Checking…" : "Check"}
        </button>
      </div>
      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
        Format: AA-920 or S-098, one or two letters, then the digits.
      </p>

      {check && <IabResult check={check} accountName={accountName} />}

      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-amber-100 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          {/* Not a verdict on the membership — we simply couldn't ask IAB. */}
          {error}. You can carry on; a supervisor will check it by hand.
        </p>
      )}
    </div>
  );
}

const panel = "mt-2 flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium";
const goodTone = "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200";
const badTone = "bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200";

/** No such number → name belongs to someone else → standing → all clear. */
function IabResult({ check, accountName }: { check: IabCheck; accountName: string }) {
  if (!check.member) {
    return (
      <p className={`${panel} ${badTone}`}>
        <XCircle className="mt-px h-4 w-4 shrink-0" />
        <span>
          The IAB directory has no member <strong>{check.membershipNo}</strong>. Double-check the
          number. If your membership is new and not listed yet, you can still continue, a supervisor
          will verify it by hand.
        </span>
      </p>
    );
  }

  const { name, email, category, status, isRegular } = check.member;
  // Recomputed here rather than trusting the reply, so the warning tracks the
  // name field as it's edited without another round trip.
  const nameOk = !accountName.trim() || iabNameMatches(accountName, name);
  const summary = (
    <>
      <strong>{check.membershipNo}</strong>, {name}
      {category && <> · {category}</>} · <span className="uppercase">{status ?? "unknown"}</span>
      {email && (
        <>
          <br />
          IAB has {email} on file.
        </>
      )}
    </>
  );

  if (!nameOk) {
    return (
      <p className={`${panel} ${badTone}`}>
        <UserX className="mt-px h-4 w-4 shrink-0" />
        <span>
          {summary}
          <br />
          This account is named <strong>{accountName}</strong>, which doesn&apos;t match the
          directory. You can&apos;t submit for verification until these agree, or send it for manual
          review if IAB has your name recorded differently.
        </span>
      </p>
    );
  }

  return (
    <p className={`${panel} ${isRegular ? goodTone : badTone}`}>
      {isRegular ? (
        <BadgeCheck className="mt-px h-4 w-4 shrink-0" />
      ) : (
        <ShieldAlert className="mt-px h-4 w-4 shrink-0" />
      )}
      <span>
        {summary}
        {isRegular
          ? ", a membership in good standing."
          : ", only a “Regular” standing counts as valid. A supervisor will look at this."}
      </span>
    </p>
  );
}
