"use client";

import { useEffect, useState } from "react";
import type { Review } from "@buildora/shared";
import { getMyReview, submitReview } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { StarPicker, Stars } from "@/components/app/Stars";

/**
 * "Rate your architect" — shown on a completed contract, to its client only.
 *
 * This is the sole way a rating enters the platform: the API refuses the write
 * unless the caller owns the contract and it has reached COMPLETED, so every
 * score in the directory comes from a finished, paid job. An existing review
 * loads back into the form so it can be revised rather than duplicated.
 */
export function ReviewCard({
  contractId,
  architectName,
}: {
  contractId: string;
  architectName: string;
}) {
  const token = useSession((s) => s.token);

  const [existing, setExisting] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getMyReview(token, contractId)
      .then((r) => {
        if (!active || !r) return;
        setExisting(r);
        setRating(r.rating);
        setComment(r.comment ?? "");
      })
      .catch(() => {}); // non-critical — the form just opens blank
    return () => {
      active = false;
    };
  }, [token, contractId]);

  async function save() {
    if (!token || rating < 1) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await submitReview(token, contractId, { rating, comment });
      setExisting(saved);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your review");
    } finally {
      setSaving(false);
    }
  }

  // Already reviewed and not editing — show it back with a way to revise.
  if (existing && !editing) {
    return (
      <div className="mt-4 rounded-2xl border border-white/50 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">Your review</p>
          <Stars rating={existing.rating} />
        </div>
        {existing.comment && (
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{existing.comment}</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-sm font-bold text-amber-600 underline underline-offset-4 dark:text-amber-400"
        >
          Edit review
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/50 bg-white/55 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm font-bold">Rate {architectName}</p>
      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
        Your rating appears on their public profile and in the architect directory.
      </p>

      <div className="mt-3">
        <StarPicker value={rating} onChange={setRating} disabled={saving} />
      </div>

      <textarea
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was working with them? (optional)"
        className="mt-3 block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500"
      />

      {error && (
        <p className="mt-2 rounded-xl bg-rose-100 px-4 py-2 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || rating < 1}
          className="rounded-full bg-amber-400 px-6 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Update review" : "Submit review"}
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm font-bold text-stone-500 dark:text-slate-400"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
