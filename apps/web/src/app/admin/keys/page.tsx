"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldAlert, RefreshCw, CheckCircle2 } from "lucide-react";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { timeAgo } from "@/components/admin/format";
import {
  getKeyStatus,
  listKeyRotations,
  startKeyRotation,
  resumeKeyRotation,
  verifyKeyRotation,
  type KeyStatus,
  type KeyRotationRun,
  type RotationScope,
} from "@/lib/apiKeys";
import { surfaceClass } from "@/components/ui/surface";
import { ListSkeleton } from "@/components/ui/Skeleton";

const cardClass = `${surfaceClass} p-5`;

const SCOPES: { value: RotationScope; label: string; covers: string }[] = [
  {
    value: "USER_PII",
    label: "User data",
    covers: "NID, date of birth, bank account, mobile wallet number and TIN",
  },
  {
    value: "LEDGER_HMAC",
    label: "Payment ledger",
    covers: "Integrity tags on contracts, milestones and payment sessions",
  },
];

const STATUS_STYLE: Record<KeyRotationRun["status"], string> = {
  RUNNING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  PAUSED: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  COMPLETED: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  VERIFIED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/**
 * Encryption key rotation.
 *
 * The keys themselves are environment variables, not database rows, so this
 * screen can't add or remove one — that stays a deliberate human step (see the
 * banner below). What it does drive is the part that's actually tedious: once
 * a new key is active, sweeping every record that's still on the old one,
 * decrypting with whichever key it was written with and re-encrypting with the
 * active key, resumably and in the open.
 */
export default function AdminKeysPage() {
  const token = useSession((s) => s.token);

  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [runs, setRuns] = useState<KeyRotationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyScope, setBusyScope] = useState<RotationScope | null>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, r] = await Promise.all([getKeyStatus(token), listKeyRotations(token)]);
      setStatus(s);
      setRuns(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load key status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStart(scope: RotationScope) {
    if (!token) return;
    setBusyScope(scope);
    setError(null);
    try {
      await startKeyRotation(token, scope);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the rotation");
    } finally {
      setBusyScope(null);
    }
  }

  async function handleResume(id: string) {
    if (!token) return;
    setBusyRun(id);
    setError(null);
    try {
      await resumeKeyRotation(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resume the run");
    } finally {
      setBusyRun(null);
    }
  }

  async function handleVerify(id: string) {
    if (!token) return;
    setBusyRun(id);
    setError(null);
    try {
      await verifyKeyRotation(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify the run");
    } finally {
      setBusyRun(null);
    }
  }

  const liveRun = (scope: RotationScope) =>
    runs.find((r) => r.scope === scope && (r.status === "RUNNING" || r.status === "PAUSED"));

  return (
    <AdminShell
      title="Encryption keys"
      subtitle="Rotate the keys protecting NID, banking and ledger data if one is ever suspected compromised"
    >
      <div className="space-y-6">
        <div className={`${cardClass} flex gap-3`}>
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="text-sm text-stone-600 dark:text-stone-300">
            <p className="font-bold text-stone-900 dark:text-white">
              This screen sweeps records — it doesn&apos;t create keys.
            </p>
            <p className="mt-1">
              Keys live in an environment variable, which this console can&apos;t write. To resolve
              a suspected breach: (1) add the new key to the keyring env var and redeploy — both
              keys now load, nothing changes yet; (2) point the *_ACTIVE env var at the new key and
              redeploy — new writes use it, old records still decrypt; (3) start the rotation below
              to convert everything else; (4) verify it; (5) only once verified, remove the old key
              from the env var. A record on the old key and one on the new key both read correctly
              the whole time, so this is safe to pause and resume.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {SCOPES.map((s) => {
              const scopeStatus = status?.[s.value === "USER_PII" ? "data" : "ledger"];
              const running = liveRun(s.value);
              return (
                <section key={s.value} className={cardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
                        {s.label}
                      </h2>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{s.covers}</p>
                    </div>
                    <KeyRound className="h-5 w-5 shrink-0 text-stone-400" />
                  </div>

                  {scopeStatus && (
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="font-bold text-stone-500 dark:text-stone-400">
                          Keys in ring
                        </dt>
                        <dd className="mt-0.5 font-mono text-stone-800 dark:text-stone-200">
                          {scopeStatus.versions.join(", ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-stone-500 dark:text-stone-400">Active</dt>
                        <dd className="mt-0.5 font-mono text-stone-800 dark:text-stone-200">
                          {scopeStatus.active}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-bold text-stone-500 dark:text-stone-400">
                          Still on an old key
                        </dt>
                        <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
                          {scopeStatus.outstanding.toLocaleString()} record
                          {scopeStatus.outstanding === 1 ? "" : "s"}
                        </dd>
                      </div>
                    </dl>
                  )}

                  <button
                    type="button"
                    disabled={
                      !scopeStatus ||
                      scopeStatus.outstanding === 0 ||
                      !!running ||
                      busyScope === s.value
                    }
                    onClick={() => handleStart(s.value)}
                    className="mt-4 flex w-full items-center justify-center gap-2 btn-primary rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {busyScope === s.value
                      ? "Starting…"
                      : running
                        ? "Rotation already in progress"
                        : scopeStatus?.outstanding === 0
                          ? "Nothing to rotate"
                          : "Start rotation to active key"}
                  </button>
                </section>
              );
            })}
          </div>
        )}

        {status && (
          <div
            className={`${cardClass} grid gap-4 text-xs text-stone-600 sm:grid-cols-2 dark:text-stone-300`}
          >
            <div>
              <p className="font-bold text-stone-900 dark:text-white">Signing keys (JWT)</p>
              <p className="mt-1">{status.jwt.note}</p>
            </div>
            <div>
              <p className="font-bold text-stone-900 dark:text-white">Blind-index key</p>
              <p className="mt-1">{status.blindIndex.note}</p>
            </div>
          </div>
        )}

        <section className={cardClass}>
          <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
            Recent rotations
          </h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              No rotation has been run yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
              {runs.map((r) => {
                const rewritten = r.progress.reduce((n, p) => n + p.rewritten, 0);
                const scanned = r.progress.reduce((n, p) => n + p.scanned, 0);
                return (
                  <li key={r._id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-extrabold ${STATUS_STYLE[r.status]}`}
                        >
                          {r.status}
                        </span>
                        <span className="text-sm font-bold text-stone-900 dark:text-white">
                          {SCOPES.find((s) => s.value === r.scope)?.label ?? r.scope}
                        </span>
                        <span className="text-xs text-stone-400">→ key {r.toVersion}</span>
                      </div>
                      <span className="text-[0.7rem] text-stone-400">{timeAgo(r.createdAt)}</span>
                    </div>

                    <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-400">
                      {rewritten.toLocaleString()} rewritten of {scanned.toLocaleString()} scanned
                      {r.failures.length > 0 && (
                        <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                          · {r.failures.length} failure{r.failures.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {r.status === "VERIFIED" && (
                        <span className="ml-1 inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> safe to remove the old key
                        </span>
                      )}
                    </p>

                    {r.failures.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-lg bg-red-50 p-2.5 text-[0.7rem] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        {r.failures.map((f, i) => (
                          <li key={i}>
                            {f.model}/{f.documentId}: {f.reason}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2.5 flex gap-2">
                      {r.status === "PAUSED" && (
                        <button
                          type="button"
                          disabled={busyRun === r._id}
                          onClick={() => handleResume(r._id)}
                          className="rounded-full btn-secondary px-4 py-1.5 text-xs disabled:opacity-50 dark:border-white/20 dark:text-stone-200"
                        >
                          {busyRun === r._id ? "Resuming…" : "Resume"}
                        </button>
                      )}
                      {r.status === "COMPLETED" && (
                        <button
                          type="button"
                          disabled={busyRun === r._id}
                          onClick={() => handleVerify(r._id)}
                          className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-stone-800 disabled:opacity-50 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
                        >
                          {busyRun === r._id ? "Verifying…" : "Verify"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
