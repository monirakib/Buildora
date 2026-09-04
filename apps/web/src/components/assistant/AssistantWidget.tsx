"use client";

import { useEffect, useRef, useState } from "react";
import {
  assistantChat,
  clearAssistantChat,
  getAssistantChat,
  type AssistantMessage,
} from "@/lib/api";
import type { AiSuggestedAction } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { useAiContext } from "@/store/useAiContext";
import { SuggestedActions } from "./SuggestedActions";

// Starter questions shown while the conversation is empty.
const suggestions = [
  "How does escrow protect my money?",
  "What do I need for a RAJUK permit?",
  "How do architects get verified?",
];

/**
 * The Buildora Guide — a floating AI chat available on every page. Guests can
 * ask questions (history lives in this component's state); signed-in users
 * get their conversation loaded from and saved to the database.
 */
export function AssistantWidget() {
  const token = useSession((s) => s.token);
  // What the current page registered, if anything. Read here and sent inside
  // send(), so every message describes the page as it is at that moment.
  const context = useAiContext((s) => s.context);

  // The user can switch the context off for a question they mean generally.
  // Reset whenever the page changes, so dismissing it once doesn't stick.
  const [useContext, setUseContext] = useState(true);
  useEffect(() => setUseContext(true), [context?.label]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /**
   * Buttons offered by the newest reply only. Kept separate from `messages`
   * because those are persisted and replayed on reload, and an action that made
   * sense yesterday ("post this draft") may be wrong today.
   */
  const [actions, setActions] = useState<AiSuggestedAction[]>([]);

  // Session hydrates from localStorage — mount-gate so server and first
  // client render match (same pattern as the navbar).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // First open while signed in: pull the stored conversation.
  useEffect(() => {
    if (!open || loaded || !token) return;
    getAssistantChat(token)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, loaded, token]);

  // Keep the newest message in view.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setError(null);
    setInput("");
    // Show the user's message immediately; the reply follows.
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    // Last turn's buttons are stale the moment a new question is asked.
    setActions([]);
    setSending(true);
    try {
      const answer = await assistantChat(
        token ?? null,
        message,
        history,
        useContext ? context : null
      );
      setMessages((m) => [...m, { role: "model", content: answer.reply }]);
      setActions(answer.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function clearAll() {
    setMessages([]);
    setActions([]);
    setError(null);
    if (token) await clearAssistantChat(token).catch(() => {});
  }

  if (!mounted) return null;

  return (
    <>
      {/* Launcher — sits above the cursor glow, below the navbar drawer */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Buildora Guide" : "Open Buildora Guide"}
        aria-expanded={open}
        className="fixed right-5 bottom-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-amber-400 text-stone-950 shadow-xl shadow-black/20 transition hover:scale-105 hover:bg-amber-300"
      >
        {open ? (
          /* close */
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        ) : (
          /* chat sparkle */
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.4-.7L3 21l1.8-5.6A8.38 8.38 0 0 1 3.6 12a8.5 8.5 0 0 1 8.4-8.5 8.38 8.38 0 0 1 9 8Z" />
            <path d="M12 8v0M8.5 12h7" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Buildora Guide"
          className="fixed right-5 bottom-22 z-40 flex h-128 w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/70 shadow-2xl shadow-black/20 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:bg-stone-950/80"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200/70 px-5 py-3.5 dark:border-white/10">
            <div>
              <p className="text-sm font-extrabold tracking-tight">Buildora Guide</p>
              <p className="text-xs text-stone-500 dark:text-slate-400">
                Escrow, permits, architects, ask away
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-500 transition hover:bg-black/5 hover:text-stone-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !sending ? (
              <div className="flex h-full flex-col justify-end gap-2">
                <p className="mb-2 text-sm text-stone-600 dark:text-slate-400">
                  Hi! I can explain how Buildora works, try one of these:
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-2xl border border-stone-300/70 bg-white/60 px-4 py-2.5 text-left text-sm font-semibold text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "self-end rounded-br-md bg-amber-400 font-semibold text-stone-950"
                        : "self-start rounded-bl-md border border-stone-200/70 bg-white/70 text-stone-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-stone-200/70 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/10">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        style={{ animationDelay: `${delay}ms` }}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 dark:bg-slate-400"
                      />
                    ))}
                  </div>
                )}
                {!sending && actions.length > 0 && (
                  <SuggestedActions actions={actions} token={token ?? null} onDone={setError} />
                )}
                {error && <p className="self-start alert alert-danger rounded-2xl">{error}</p>}
              </div>
            )}
          </div>

          {/*
            What the assistant can see. Shown for two reasons: so the user
            isn't surprised that it knows about their project, and so they can
            turn it off for a question they mean generally.
          */}
          {token && useContext && context?.label && (
            <div className="flex items-center gap-2 border-t border-stone-200/70 px-4 py-2 dark:border-white/10">
              <span className="min-w-0 flex-1 truncate text-xs text-stone-500 dark:text-slate-400">
                Looking at{" "}
                <span className="font-semibold text-stone-700 dark:text-slate-200">
                  {context.label}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setUseContext(false)}
                aria-label="Ask without page context"
                className="rounded-md px-1.5 py-0.5 text-xs font-bold text-stone-400 transition hover:bg-black/5 hover:text-stone-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-stone-200/70 p-3 dark:border-white/10"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder="Ask about permits, escrow, architects…"
              className="min-w-0 flex-1 rounded-xl border border-stone-300/70 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-stone-950 transition hover:bg-amber-300 disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
