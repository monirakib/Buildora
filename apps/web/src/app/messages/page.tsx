"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChatMessage, Conversation } from "@buildora/shared";
import { getConversationMessages, listConversations, sendMessage } from "@/lib/apiMessages";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const roleLabels: Record<string, string> = {
  LAND_OWNER: "Land owner",
  ARCHITECT: "Architect",
  STRUCTURAL_ENGINEER: "Structural engineer",
  CONTRACTOR: "Contractor",
  SUPPLIER: "Supplier",
  ADMIN: "Supervisor",
};

/**
 * Two-pane inbox: conversations on the left, the open thread on the right
 * (stacked on mobile — the list hides while a thread is open). The open
 * thread refreshes every 5 seconds; opening a thread marks it read.
 */
function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && (!user || !token)) router.replace("/auth");
  }, [mounted, user, token, router]);

  const loadInbox = useCallback(async () => {
    if (!token) return;
    try {
      setConversations(await listConversations(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your messages");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadThread = useCallback(async () => {
    if (!token || !activeId) return;
    try {
      const data = await getConversationMessages(token, activeId);
      setActive(data.conversation);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the conversation");
    }
  }, [token, activeId]);

  // Inbox on mount; thread whenever ?c changes; poll the open thread + inbox.
  useEffect(() => {
    if (!mounted || !token) return;
    loadInbox();
  }, [mounted, token, loadInbox]);

  useEffect(() => {
    if (!mounted || !token || !activeId) {
      setActive(null);
      setMessages([]);
      return;
    }
    loadThread();
    const timer = setInterval(() => {
      loadThread();
      loadInbox();
    }, 5000);
    return () => clearInterval(timer);
  }, [mounted, token, activeId, loadThread, loadInbox]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !activeId || !draft.trim()) return;
    setSending(true);
    try {
      const sent = await sendMessage(token, activeId, draft);
      setMessages((list) => [...list, sent]);
      setDraft("");
      loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-10 sm:px-8">
        <div className="mx-auto flex h-[calc(100vh-11rem)] w-full max-w-5xl flex-col">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Messages</h1>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-5 flex min-h-0 flex-1 gap-4">
            {/* Inbox — hidden on mobile while a thread is open */}
            <aside
              className={`${activeId ? "hidden md:flex" : "flex"} w-full flex-col overflow-y-auto rounded-3xl border border-white/40 bg-white/40 p-3 backdrop-blur-xl md:w-80 dark:border-white/10 dark:bg-white/5`}
            >
              {loading ? (
                <p className="p-3 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="p-3 text-sm text-stone-600 dark:text-slate-400">
                  No conversations yet. Open one from a project or an accepted request.
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => router.push(`/messages?c=${c.id}`)}
                    className={`flex items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-black/5 dark:hover:bg-white/10 ${
                      c.id === activeId ? "bg-black/5 dark:bg-white/10" : ""
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400 font-extrabold text-stone-950">
                      {c.other.name[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold">{c.other.name}</span>
                        {c.lastMessage && (
                          <span className="shrink-0 text-xs text-stone-500 dark:text-slate-500">
                            {formatTime(c.lastMessage.at)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-stone-600 dark:text-slate-400">
                          {c.lastMessage
                            ? `${c.lastMessage.mine ? "You: " : ""}${c.lastMessage.body}`
                            : (roleLabels[c.other.role] ?? c.other.role)}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-400 px-1 text-xs font-bold text-stone-950">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </aside>

            {/* Thread */}
            <section
              className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-white/5`}
            >
              {!activeId || !active ? (
                <div className="grid flex-1 place-items-center p-6 text-center text-sm text-stone-500 dark:text-slate-500">
                  Pick a conversation to start chatting.
                </div>
              ) : (
                <>
                  <header className="flex items-center gap-3 border-b border-black/10 p-4 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => router.push("/messages")}
                      className="rounded-lg px-2 py-1 text-sm font-bold text-stone-500 hover:bg-black/5 md:hidden dark:text-slate-400 dark:hover:bg-white/10"
                      aria-label="Back to conversations"
                    >
                      ←
                    </button>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-400 font-extrabold text-stone-950">
                      {active.other.name[0]?.toUpperCase()}
                    </span>
                    <div>
                      <p className="font-bold">{active.other.name}</p>
                      <p className="text-xs text-stone-500 dark:text-slate-500">
                        {roleLabels[active.other.role] ?? active.other.role} · @
                        {active.other.username}
                      </p>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex flex-col gap-2">
                      {messages.map((m) => {
                        const mine = m.senderId === user?.id;
                        return (
                          <div
                            key={m.id}
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                              mine
                                ? "self-end rounded-br-md bg-amber-400 text-stone-950"
                                : "self-start rounded-bl-md bg-black/5 text-stone-800 dark:bg-white/10 dark:text-slate-200"
                            }`}
                          >
                            {m.body}
                            <span
                              className={`mt-1 block text-right text-[10px] ${
                                mine ? "text-stone-700/70" : "text-stone-500 dark:text-slate-500"
                              }`}
                            >
                              {formatTime(m.createdAt)}
                            </span>
                          </div>
                        );
                      })}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  <form
                    onSubmit={handleSend}
                    className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10"
                  >
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a message…"
                      className={inputClass}
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="shrink-0 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                    >
                      Send
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

// useSearchParams must sit under a Suspense boundary in the App Router.
export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}
