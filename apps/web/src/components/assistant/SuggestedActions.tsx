"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AiSuggestedAction } from "@buildora/shared";
import { AI_ACTIONS, knownActions } from "@/lib/aiActions";

/**
 * The buttons the assistant offers under a reply.
 *
 * Everything about what a button does comes from lib/aiActions.ts, which this
 * app owns. The server supplied a key and the wording; this decides the
 * behaviour. Anything that changes data asks first, and the assistant never
 * performs it on the user's behalf — a person clicks, every time.
 */
export function SuggestedActions({
  actions,
  token,
  onDone,
}: {
  actions: AiSuggestedAction[];
  token: string | null;
  onDone?: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const usable = knownActions(actions);
  if (usable.length === 0) return null;

  async function activate(suggestion: AiSuggestedAction) {
    const handler = AI_ACTIONS[suggestion.action];
    const params = suggestion.params ?? {};

    if (handler.kind === "navigate") {
      router.push(handler.href(params));
      return;
    }

    if (!token) return;
    if (!window.confirm(handler.confirm)) return;

    setBusy(suggestion.action);
    try {
      await handler.run(token, params);
      router.push(handler.thenHref(params));
    } catch (err) {
      onDone?.(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 self-start">
      {usable.map((suggestion) => (
        <button
          key={suggestion.action}
          type="button"
          disabled={busy !== null}
          onClick={() => void activate(suggestion)}
          className="rounded-xl border border-amber-500/60 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-400/30 disabled:opacity-50 dark:border-amber-400/50 dark:text-amber-300"
        >
          {busy === suggestion.action ? "Working…" : suggestion.label}
        </button>
      ))}
    </div>
  );
}
