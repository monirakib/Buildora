"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, Check, Lock } from "lucide-react";
import type { PublicProgress } from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";

/**
 * The public progress page.
 *
 * No navbar, no login, no session — someone opens this from a WhatsApp message
 * and sees how the building is coming along. It shows stages and a percentage
 * and nothing else: no money, no names, no address beyond the locality. What
 * makes the unguessable link acceptable is that there is nothing here worth
 * stealing.
 */
export default function PublicProgressPage() {
  const params = useParams<{ token: string }>();
  const [progress, setProgress] = useState<PublicProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetched directly rather than through lib/api, because that helper
    // attaches session handling this page has no business with.
    fetch(`${API_BASE_URL}/api/public/progress/${params.token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message ?? "This link isn't valid");
        setProgress(body.data.progress as PublicProgress);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
        <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      </main>
    );
  }

  if (error || !progress) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-6 dark:bg-[#05070C]">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-stone-500/10 dark:bg-white/10">
            <Lock className="h-5 w-5 text-stone-500 dark:text-slate-400" />
          </span>
          <p className="mt-4 font-bold text-stone-900 dark:text-slate-100">
            This link isn&apos;t available
          </p>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {error ?? "It may have been revoked by the owner."}
          </p>
        </div>
      </main>
    );
  }

  const stages = [
    { label: "Design approved", done: progress.designApproved },
    { label: "Structural drawings approved", done: progress.structuralApproved },
    { label: "RAJUK permit issued", done: progress.permitIssued },
    { label: "Construction started", done: progress.constructionStarted },
    { label: "Handed over", done: progress.handedOver },
  ];

  return (
    <main className="min-h-screen bg-stone-100 px-5 py-12 sm:px-8 dark:bg-[#05070C]">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
          Buildora · Project progress
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-slate-100">
          {progress.title}
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          {progress.floors}-storey {progress.buildingType.replace(/_/g, " ").toLowerCase()} ·{" "}
          {progress.areaName}
        </p>

        {/* Construction bar — only meaningful once building starts */}
        {progress.constructionStarted && (
          <div className="mt-8 rounded-2xl border border-white/50 bg-white/60 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Construction</p>
              <p className="text-2xl font-extrabold text-stone-900 dark:text-slate-100">
                {progress.constructionPercent}%
              </p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-700"
                style={{ width: `${progress.constructionPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
              Weighted by each stage&apos;s share of the build, not by counting stages.
            </p>
          </div>
        )}

        {/* Stages */}
        <ul className="mt-6 flex flex-col gap-2">
          {stages.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-3 rounded-xl border border-white/50 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : "border border-stone-300 dark:border-white/20"
                }`}
              >
                {s.done && <Check className="h-3.5 w-3.5" />}
              </span>
              <span
                className={`text-sm font-semibold ${
                  s.done
                    ? "text-stone-900 dark:text-slate-100"
                    : "text-stone-500 dark:text-slate-500"
                }`}
              >
                {s.label}
              </span>
            </li>
          ))}
        </ul>

        {/* Milestone list, when there is one */}
        {progress.milestones.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
              Build stages
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {progress.milestones.map((m) => (
                <li
                  key={m.order}
                  className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-slate-300"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      m.done ? "bg-emerald-500" : "bg-black/15 dark:bg-white/15"
                    }`}
                  />
                  <span className={m.done ? "" : "text-stone-500 dark:text-slate-500"}>
                    {m.order}. {m.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {progress.handedOver && progress.handedOverAt && (
          <p className="mt-6 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <Building2 className="mr-1.5 inline h-4 w-4" />
            Handed over on {progress.handedOverAt}.
          </p>
        )}

        <p className="mt-8 text-xs text-stone-500 dark:text-slate-500">
          Shared by the project owner · last updated{" "}
          {new Date(progress.updatedAt).toLocaleDateString()}. This page shows progress only — no
          financial or contract details are included.
        </p>
      </div>
    </main>
  );
}
