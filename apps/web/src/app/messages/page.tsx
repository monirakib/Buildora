"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import {
  CallMedia,
  CallStatus,
  type CallRecord,
  type ChatMessage,
  type Conversation,
} from "@buildora/shared";
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

/**
 * How long ago someone was last connected, e.g. "Active 5 mins ago". Only used
 * when they're offline — while they're online the header says "Online now".
 */
function formatLastSeen(lastSeenAt?: string) {
  if (!lastSeenAt) return "Offline";
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 1) return "Active just now";
  if (mins < 60) return `Active ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days} day${days === 1 ? "" : "s"} ago`;
  return `Active on ${new Date(lastSeenAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`;
}

/**
 * Initial-letter avatar with a presence dot. The green dot appears only while
 * the person has a live socket, so it can't get stuck on after they close the tab.
 */
function PresenceAvatar({
  name,
  online,
  size,
}: {
  name: string;
  online: boolean;
  size: "sm" | "md";
}) {
  const box = size === "md" ? "h-10 w-10" : "h-9 w-9";
  const dot = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <span className="relative shrink-0">
      <span
        className={`${box} grid place-items-center rounded-full bg-amber-400 font-extrabold text-stone-950`}
      >
        {name[0]?.toUpperCase()}
      </span>
      {online && (
        <span
          className={`${dot} absolute right-0 bottom-0 rounded-full border-2 border-white bg-emerald-500 dark:border-stone-950`}
          title="Online now"
          aria-label="Online now"
        />
      )}
    </span>
  );
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
  // Calls are logged as the kind they were placed as; a camera switched on
  // mid-call isn't recorded, so a voice call stays "voice" in the history.
  const kind = call.media === CallMedia.VIDEO ? "video" : "voice";
  let label: string;
  if (call.status === CallStatus.REJECTED) label = outgoing ? "Call declined" : "Declined call";
  else if (call.status === CallStatus.CANCELLED)
    label = outgoing ? "Cancelled call" : `Missed ${kind} call`;
  else if (unanswered) label = outgoing ? "No answer" : `Missed ${kind} call`;
  else label = `${outgoing ? "Outgoing" : "Incoming"} ${kind} call`;
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

  // Inbox on mount, then every 10s — this is also what keeps the presence dots
  // in the list current, so it polls whether or not a thread is open.
  useEffect(() => {
    if (!mounted || !token) return;
    loadInbox();
    const timer = setInterval(loadInbox, 10000);
    return () => clearInterval(timer);
  }, [mounted, token, loadInbox]);

  useEffect(() => {
    if (!mounted || !token || !activeId) {
      setActive(null);
      setMessages([]);
      return;
    }
    loadThread();
    loadCalls();
    // The open thread refreshes faster than the inbox — new messages and the
    // peer's "Online now" / "Active … ago" line both come from this poll.
    const timer = setInterval(() => {
      loadThread();
      loadCalls();
    }, 5000);
    return () => clearInterval(timer);
  }, [mounted, token, activeId, loadThread, loadCalls]);

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
              className={`${activeId ? "hidden md:flex" : "flex"} w-full flex-col overflow-y-auto rounded-2xl border border-white/50 bg-white/55 p-3 backdrop-blur-xl md:w-80 dark:border-white/10 dark:bg-white/5`}
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
                    <PresenceAvatar name={c.other.name} online={c.other.online} size="md" />
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
              className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/55 backdrop-blur-xl dark:border-white/10 dark:bg-white/5`}
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
                    <PresenceAvatar
                      name={active.other.name}
                      online={active.other.online}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{active.other.name}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-slate-500">
                        {roleLabels[active.other.role] ?? active.other.role} · @
                        {active.other.username}
                      </p>
                      {active.other.online ? (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Online now
                        </p>
                      ) : (
                        <p className="text-xs text-stone-400 dark:text-slate-500">
                          {formatLastSeen(active.other.lastSeenAt)}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startCall(active.other, CallMedia.AUDIO)}
                        disabled={callPhase !== "idle"}
                        className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 disabled:opacity-50"
                        aria-label={`Call ${active.other.name}`}
                        title="Voice call"
                      >
                        <Phone className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startCall(active.other, CallMedia.VIDEO)}
                        disabled={callPhase !== "idle"}
                        className="grid h-10 w-10 place-items-center rounded-full bg-sky-500 text-white transition hover:bg-sky-400 disabled:opacity-50"
                        aria-label={`Video call ${active.other.name}`}
                        title="Video call"
                      >
                        <Video className="h-5 w-5" />
                      </button>
                    </div>
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
                              <div
                                key={`call-${item.call.id}`}
                                className="my-1 flex justify-center"
                              >
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
