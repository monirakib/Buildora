"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { checkNidFormat, nidMatchesDateOfBirth, type NidCheck } from "@buildora/shared";
import { runNidCheck } from "@/lib/api";
import { useSession } from "@/store/useSession";

/**
 * Runs and displays the automated NID pre-screen. Used by land owners in
 * account settings and by professionals in the verification wizard — the checks
 * are identical for every role.
 *
 * The wording here is deliberate. This never says "verified": the Election
 * Commission is the only authority that can confirm an NID, and its Porichoy
 * gateway is fee-based and restricted to vetted companies. What this does is
 * catch typos, mismatched cards and reused numbers before a supervisor looks.
 */
export function NidCheckPanel({
  nid,
  dateOfBirth,
  hasCardImage,
  saved,
  /** Called after a run so the parent can refresh its copy of the profile. */
  onChecked,
}: {
  nid: string;
  dateOfBirth?: string;
  hasCardImage: boolean;
  /** The stored result from the last run, if any. */
  saved?: NidCheck;
  onChecked?: (check: NidCheck) => void;
}) {
  const token = useSession((s) => s.token);
  const [check, setCheck] = useState<NidCheck | undefined>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Instant, offline feedback while they're still typing — no request needed.
  const format = checkNidFormat(nid);
  const dobMatches = nidMatchesDateOfBirth(nid, dateOfBirth);
  // A stored result is only about the number it was run against.
  const current = check && check.nid === format.normalized ? check : undefined;

  async function run() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const result = await runNidCheck(token);
      setCheck(result);
      onChecked?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't run the check");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/50 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="flex items-center gap-2 text-sm font-bold">
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        NID document check
      </p>
      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
        Buildora checks the number&apos;s structure, whether it&apos;s already in use, and whether
        your uploaded card matches. A supervisor confirms your identity — this is not a government
        verification.
      </p>

      {/* Offline checks, live as they type */}
      <ul className="mt-3 space-y-1.5">
        <Row
          ok={format.ok}
          label={
            format.ok ? `Valid ${labelFor(format.format)} number` : (format.issue ?? "Invalid")
          }
        />
        {dobMatches !== undefined && (
          <Row
            ok={dobMatches}
            label={
              dobMatches
                ? "Birth year in the NID matches your date of birth"
                : "Birth year in the NID does not match your date of birth"
            }
          />
        )}
        {current && (
          <Row
            ok={!current.duplicate}
            label={
              current.duplicate
                ? "This NID is already registered to another account"
                : "Not registered to any other account"
            }
          />
        )}
        {current?.ocr && <OcrRows ocr={current.ocr} />}
      </ul>

      {!hasCardImage && (
        <p className="mt-3 flex items-start gap-2 text-xs text-stone-500 dark:text-slate-500">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          Upload a photo of your NID card to have it read and compared.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={busy || !format.ok || !token}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Checking…" : current ? "Run check again" : "Run NID check"}
      </button>

      {current && (
        <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
          Last checked {new Date(current.checkedAt).toLocaleString()}. Save your profile first if
          you&apos;ve just changed anything.
        </p>
      )}
    </div>
  );
}

function labelFor(format?: string) {
  return format === "SMART_10"
    ? "10-digit Smart NID"
    : format === "LEGACY_17"
      ? "17-digit"
      : "13-digit";
}

/** One pass/fail line. */
function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-500" />
      )}
      <span
        className={
          ok
            ? "text-stone-600 dark:text-slate-400"
            : "font-semibold text-rose-700 dark:text-rose-300"
        }
      >
        {label}
      </span>
    </li>
  );
}

/** What the card image said, and whether it agreed. */
function OcrRows({ ocr }: { ocr: NonNullable<NidCheck["ocr"]> }) {
  if (!ocr.readable) {
    return (
      <li className="flex items-start gap-2 text-xs">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="text-stone-600 dark:text-slate-400">
          {ocr.note ?? "Your NID card image couldn't be read"} — a supervisor will check it by hand.
        </span>
      </li>
    );
  }

  // null means the card didn't show that field, which isn't a mismatch.
  const rows: [boolean | null | undefined, string, string][] = [
    [ocr.nameMatches, "Name on the card matches your account", "Name on the card is different"],
    [ocr.nidMatches, "NID number on the card matches", "NID number on the card is different"],
    [ocr.dobMatches, "Date of birth on the card matches", "Date of birth on the card is different"],
  ];

  return (
    <>
      {rows.map(([value, good, bad]) =>
        value === null || value === undefined ? null : (
          <Row key={good} ok={value} label={value ? good : bad} />
        )
      )}
    </>
  );
}
