"use client";

import { useState } from "react";
import { draftProposal } from "@/lib/apiAssistant";
import { AiDots } from "@/components/assistant/AiPanel";

/**
 * "Draft with AI" — writes a first cover letter into the pitch form.
 *
 * It is a starting point, not a submission. The text lands in the textarea the
 * architect was going to type into, they edit it, and sending the proposal is
 * still the separate button it always was. Nothing here submits anything.
 *
 * If there's already a letter in the box it asks before replacing it — losing
 * someone's writing to a stray click would be a poor trade for a convenience.
 */
export function ProposalDraftButton({
  token,
  projectId,
  hasExistingText,
  onDraft,
}: {
  token: string;
  projectId: string;
  hasExistingText: boolean;
  onDraft: (coverLetter: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<"formal" | "warm">("formal");

  async function run() {
    if (hasExistingText && !window.confirm("Replace what you've written so far?")) return;

    setBusy(true);
    setError(null);
    try {
      const draft = await draftProposal(token, projectId, tone);
      onDraft(draft.coverLetter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft the letter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-400/25 disabled:opacity-50 dark:text-amber-300"
        >
          {busy ? <AiDots /> : "Draft with AI"}
        </button>

        {/* Two tones, because a pitch to a family home isn't a pitch to a developer. */}
        <div className="flex rounded-lg border border-black/10 p-0.5 dark:border-white/15">
          {(["formal", "warm"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              disabled={busy}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                tone === t
                  ? "bg-amber-400 text-stone-950"
                  : "text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-stone-500 dark:text-slate-400">
        Written from this brief and your own portfolio. Read it before you send it.
      </p>

      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
