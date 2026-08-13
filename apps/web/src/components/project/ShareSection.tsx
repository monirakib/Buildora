"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { disableProjectShare, enableProjectShare, getProjectShare } from "@/lib/apiEstimator";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

/**
 * The public progress link.
 *
 * One unguessable URL, no login behind it, showing stages and a percentage and
 * nothing else — no money, no contracts, no names, no street address. That is
 * what makes handing it to a relative safe. Revoking unsets the token, which
 * breaks every copy of the link that was ever sent.
 */
export function ShareSection({ projectId, token }: { projectId: string; token: string }) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShareToken(await getProjectShare(token, projectId));
    } catch {
      setShareToken(null);
    }
  }, [token, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Built in the browser so it always matches wherever the app is actually
  // served from, rather than a base URL baked in at build time.
  const url =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/p/${shareToken}`
      : null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Share progress</h2>
      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        <p className="text-sm text-stone-600 dark:text-slate-400">
          A read-only page for family or investors. It shows which stage the build has reached and
          how far construction has got, never money, contracts, or who you&apos;ve hired.
        </p>

        {url ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-300/60 bg-white/60 px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
              <Link2 className="h-4 w-4 shrink-0 text-stone-500 dark:text-slate-500" />
              <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:underline dark:text-amber-400"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => disableProjectShare(token, projectId))}
                className="rounded-full border border-rose-300 px-5 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
              >
                Stop sharing
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => enableProjectShare(token, projectId, true))}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-5 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" /> New link
              </button>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-500">
              Anyone with this link can open it. Stopping or replacing it breaks every copy
              you&apos;ve already sent.
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => enableProjectShare(token, projectId))}
            className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create a share link"}
          </button>
        )}
      </div>
    </section>
  );
}
