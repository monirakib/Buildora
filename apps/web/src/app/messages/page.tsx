"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { CallStatus, type CallRecord, type ChatMessage, type Conversation } from "@buildora/shared";
import { listRecentCalls } from "@/lib/apiCalls";
import { getConversationMessages, listConversations, sendMessage } from "@/lib/apiMessages";
import { useCall } from "@/store/useCall";
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** m:ss talk time, e.g. 2:07. */
function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Calls that never connected show in red with a "missed" icon. */
const unansweredStatuses: CallStatus[] = [
  CallStatus.MISSED,
  CallStatus.REJECTED,
  CallStatus.CANCELLED,
];

/** Human label + look for one call-history entry, from the viewer's side. */
function describeCall(call: CallRecord) {
  const unanswered = unansweredStatuses.includes(call.status);
  const outgoing = call.direction === "OUTGOING";
  let label: string;
  if (call.status === CallStatus.REJECTED) label = outgoing ? "Call declined" : "Declined call";
  else if (call.status === CallStatus.CANCELLED)
    label = outgoing ? "Cancelled call" : "Missed voice call";
  else if (unanswered) label = outgoing ? "No answer" : "Missed voice call";
  else label = outgoing ? "Outgoing voice call" : "Incoming voice call";
  const Icon = unanswered ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
  return { label, unanswered, answered: !unanswered, Icon };
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
  const startCall = useCall((s) => s.start);
  const callPhase = useCall((s) => s.phase);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
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

  // Recent calls across all conversations; the thread filters to the open peer.
  const loadCalls = useCallback(async () => {
    if (!token) return;
    try {
      setCalls(await listRecentCalls(token));
    } catch {
      // Non-fatal — the message thread still works without the call log.
    }
  }, [token]);

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
    loadCalls();
    const timer = setInterval(() => {
      loadThread();
      loadCalls();
      loadInbox();
    }, 5000);
    return () => clearInterval(timer);
  }, [mounted, token, activeId, loadThread, loadCalls, loadInbox]);

  // A call just ended — refresh the log so the new entry shows right away.
  useEffect(() => {
    if (callPhase === "idle") loadCalls();
  }, [callPhase, loadCalls]);

  // Keep the newest entry in view (messages or calls).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, calls.length]);

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
                    <button
                      type="button"
                      onClick={() => startCall(active.other)}
                      disabled={callPhase !== "idle"}
                      className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 disabled:opacity-50"
                      aria-label={`Call ${active.other.name}`}
                      title="Voice call"
                    >
                      <Phone className="h-5 w-5" />
                    </button>
                  </header>

                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex flex-col gap-2">
                      {/* Messages and call-log entries, merged into one timeline
                          by time so calls appear inline where they happened. */}
                      {[
                        ...messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, msg: m })),
                        ...calls
                          .filter((c) => c.peer.id === active.other.id)
                          .map((c) => ({ kind: "call" as const, at: c.startedAt, call: c })),
                      ]
                        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                        .map((item) => {
                          if (item.kind === "call") {
                            const desc = describeCall(item.call);
                            const CallIcon = desc.Icon;
                            return (
                              <div key={`call-${item.call.id}`} className="my-1 flex justify-center">
                                <div
                                  className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full px-3.5 py-1.5 text-xs ${
                                    desc.unanswered
                                      ? "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
                                      : "bg-black/5 text-stone-600 dark:bg-white/10 dark:text-slate-300"
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5 font-semibold">
                                    <CallIcon className="h-3.5 w-3.5" />
                                    {desc.label}
                                  </span>
                                  {desc.answered && item.call.durationSec > 0 && (
                                    <span className="tabular-nums">
                                      · {formatDuration(item.call.durationSec)}
                                    </span>
                                  )}
                                  <span className="text-stone-400 dark:text-slate-500">
                                    · {formatDateTime(item.call.startedAt)}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          const m = item.msg;
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
