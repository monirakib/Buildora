"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanCompliance, PlanFurniture, PlanRoom } from "@buildora/shared";
import { askLayoutAdvisor, describeFloor, type AdviceMessage } from "@/lib/groqAdvisor";

/**
 * The layout advisor tab beside the floor-plan canvas.
 *
 * The conversation lives only in this component: it is advice about a drawing
 * in progress, not a record of anything, so there is nothing to store. What it
 * *does* keep current is the plan description — `describeFloor` runs again on
 * every question, so the advisor always answers about the rooms as they are
 * now, not as they were when the chat started.
 */

const QUICK_PROMPTS = [
  { label: "Review my layout", prompt: "Review the layout I have drawn and suggest improvements." },
  {
    label: "3-bedroom Dhaka flat",
    prompt:
      "Suggest a standard 3-bedroom flat layout for Dhaka, with a size in feet for each room.",
  },
  {
    label: "Standard room sizes",
    prompt: "What are the standard room sizes for apartments in Bangladesh?",
  },
  {
    label: "Ventilation & light",
    prompt:
      "How should I place windows and openings in this plan for cross-ventilation and daylight in Dhaka's climate?",
  },
];

export function LayoutAdvisor({
  token,
  projectId,
  level,
  rooms,
  furniture,
  compliance,
  areaName,
}: {
  token: string;
  projectId: string;
  level: number;
  rooms: PlanRoom[];
  furniture: PlanFurniture[];
  compliance: PlanCompliance | null;
  areaName: string;
}) {
  const [messages, setMessages] = useState<AdviceMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest reply in view as the conversation grows.
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const next: AdviceMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const grounding = describeFloor({ level, rooms, furniture, compliance, areaName });
      const reply = await askLayoutAdvisor(token, projectId, next, grounding);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      // Covers the not-configured case too: the API answers 503 with its own
      // wording when no Groq key is set, so there is nothing to detect here.
      setError(err instanceof Error ? err.message : "The advisor couldn't answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-black/10 p-3 dark:border-white/10">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={busy}
            onClick={() => send(q.prompt)}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-semibold text-stone-600 transition hover:border-amber-400 hover:text-stone-900 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:text-white"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="max-h-80 min-h-40 flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.length === 0 && !busy && (
          <p className="py-4 text-xs leading-relaxed text-stone-500 dark:text-slate-500">
            Ask about room proportions, circulation, or ventilation. The advisor can see the rooms
            you have drawn on this floor and the DAP limits for {areaName}.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-amber-400/15 font-medium text-stone-800 dark:text-slate-100"
                : "bg-black/4 text-stone-700 dark:bg-white/5 dark:text-slate-300"
            }`}
          >
            {m.content}
          </div>
        ))}

        {busy && (
          <div className="rounded-xl bg-black/4 px-3 py-2.5 dark:bg-white/5">
            <span className="inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 dark:bg-slate-500"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        )}

        {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      <div className="flex items-end gap-2 border-t border-black/10 p-3 dark:border-white/10">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Ask about this layout…"
          aria-label="Ask the layout advisor"
          className="flex-1 resize-none rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-xs text-stone-900 outline-none transition focus:border-amber-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          Ask
        </button>
      </div>
    </div>
  );
}
