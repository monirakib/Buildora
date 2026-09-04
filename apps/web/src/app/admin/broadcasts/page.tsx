"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Info, Send } from "lucide-react";
import {
  ACTOR_ROLES,
  BROADCAST_ALL,
  NotificationType,
  UserRole,
  type Broadcast,
  type BroadcastAudience,
} from "@buildora/shared";
import { listBroadcasts, sendBroadcast } from "@/lib/apiAdmin";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { ROLE_LABELS, timeAgo } from "@/components/admin/format";

/** Audience options, in the order they read best in the dropdown. */
const AUDIENCES: { value: BroadcastAudience; label: string }[] = [
  { value: BROADCAST_ALL, label: "Everyone (all non-admin users)" },
  // ACTOR_ROLES rather than every UserRole: it already excludes the operator
  // accounts, so a new non-actor role can't quietly appear in this dropdown the
  // way it would with a filter that has to be remembered.
  ...ACTOR_ROLES.filter((role) => role !== UserRole.ADMIN).map((role) => ({
    value: role as BroadcastAudience,
    label: `${ROLE_LABELS[role]}s only`,
  })),
];

const MAX_TITLE = 140;
const MAX_BODY = 500;

/** Shared input styling — matches the rest of the console's forms. */
const fieldClass =
  "w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500";

const labelClass = "block text-xs font-extrabold tracking-wide text-stone-500 dark:text-stone-400";

/** "ALL" → "Everyone"; a role → "Architects". */
function audienceLabel(audience: BroadcastAudience): string {
  return audience === BROADCAST_ALL ? "Everyone" : `${ROLE_LABELS[audience as UserRole]}s`;
}

/**
 * Admin announcements: compose a promotional or system message, pick who gets
 * it, and send. Sending writes one real notification row per recipient, so the
 * message shows up in those users' bells straight away (live, over the socket,
 * for anyone currently online). The history below lists past sends with the
 * number of bells each one reached.
 */
export default function AdminBroadcastsPage() {
  const token = useSession((s) => s.token);

  const [type, setType] = useState<NotificationType.PROMOTION | NotificationType.SYSTEM>(
    NotificationType.PROMOTION
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>(BROADCAST_ALL);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Broadcast | null>(null);

  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const page = await listBroadcasts(token);
      setHistory(page.items);
    } catch {
      // A failed history load shouldn't block composing a new announcement.
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSending(true);
    setError(null);
    setSent(null);
    try {
      const broadcast = await sendBroadcast(token, {
        type,
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        audience,
      });
      setSent(broadcast);
      setTitle("");
      setBody("");
      setLink("");
      // Put the new send at the top without another round trip.
      setHistory((prev) => [broadcast, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the announcement");
    } finally {
      setSending(false);
    }
  }

  const canSend = title.trim().length >= 3 && body.trim().length >= 10 && !sending;

  return (
    <AdminShell
      title="Announcements"
      subtitle="Send promotional and system messages to users' notification bells"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---- Composer ---- */}
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
            New announcement
          </h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Every recipient gets their own notification they can read and dismiss.
          </p>

          <form onSubmit={handleSend} className="mt-5 space-y-4">
            {/* Type — promo vs system notice */}
            <fieldset>
              <legend className={labelClass}>Kind</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      value: NotificationType.PROMOTION,
                      label: "Promotional",
                      hint: "Offers, launches",
                      icon: Megaphone,
                    },
                    {
                      value: NotificationType.SYSTEM,
                      label: "System notice",
                      hint: "Maintenance, policy",
                      icon: Info,
                    },
                  ] as const
                ).map((option) => {
                  const Icon = option.icon;
                  const active = type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setType(option.value)}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-amber-400 bg-amber-400/10"
                          : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/25"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-amber-700 dark:text-amber-400" : "text-stone-400"}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-stone-900 dark:text-white">
                          {option.label}
                        </span>
                        <span className="block text-[0.7rem] text-stone-500 dark:text-stone-400">
                          {option.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="broadcast-audience" className={labelClass}>
                Audience
              </label>
              <select
                id="broadcast-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
                className={`mt-1.5 ${fieldClass}`}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="broadcast-title" className={labelClass}>
                Headline
              </label>
              <input
                id="broadcast-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="20% off cement this week"
                className={`mt-1.5 ${fieldClass}`}
              />
              <p className="mt-1 text-right text-[0.7rem] text-stone-400">
                {title.length}/{MAX_TITLE}
              </p>
            </div>

            <div>
              <label htmlFor="broadcast-body" className={labelClass}>
                Message
              </label>
              <textarea
                id="broadcast-body"
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                rows={4}
                placeholder="Order Shah Cement through the Buildora marketplace before Friday and save on every bag."
                className={`mt-1.5 resize-y ${fieldClass}`}
              />
              <p className="mt-1 text-right text-[0.7rem] text-stone-400">
                {body.length}/{MAX_BODY}
              </p>
            </div>

            <div>
              <label htmlFor="broadcast-link" className={labelClass}>
                Link <span className="font-semibold text-stone-400">(optional)</span>
              </label>
              <input
                id="broadcast-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/marketplace"
                className={`mt-1.5 ${fieldClass}`}
              />
              <p className="mt-1 text-[0.7rem] text-stone-400">
                An in-app path starting with “/”. Clicking the notification opens it.
              </p>
            </div>

            {error && (
              <p className="rounded-xl bg-red-100 px-3.5 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                {error}
              </p>
            )}
            {sent && (
              <p className="alert alert-success">
                Sent to {sent.recipients} {sent.recipients === 1 ? "person" : "people"}.
              </p>
            )}

            <button
              type="submit"
              disabled={!canSend}
              className="flex w-full items-center justify-center gap-2 btn-primary rounded-xl px-4 py-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send announcement"}
            </button>
          </form>
        </section>

        {/* ---- Live preview + send history ---- */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">
              How it will look
            </h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              This is the row recipients see in their notification bell.
            </p>

            <div className="mt-4 flex gap-3 rounded-xl bg-amber-400/8 p-3 dark:bg-amber-400/6">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  type === NotificationType.PROMOTION
                    ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300"
                    : "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-300"
                }`}
              >
                {type === NotificationType.PROMOTION ? (
                  <Megaphone className="h-4.5 w-4.5" />
                ) : (
                  <Info className="h-4.5 w-4.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-stone-900 dark:text-white">
                  {title.trim() || "Your headline appears here"}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  {body.trim() || "And the message body, over up to two lines."}
                </p>
                <p className="mt-1 text-[0.7rem] font-semibold text-stone-400 dark:text-stone-500">
                  just now
                </p>
              </div>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <h2 className="text-sm font-extrabold text-stone-900 dark:text-white">Sent</h2>

            {loadingHistory ? (
              <p className="mt-4 text-sm text-stone-500 dark:text-stone-400 loading-dots">
                Loading
              </p>
            ) : history.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
                Nothing sent yet. Your announcements will be listed here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
                {history.map((b) => (
                  <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm font-bold text-stone-900 dark:text-white">
                        {b.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold ${
                          b.type === NotificationType.PROMOTION
                            ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300"
                            : "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-300"
                        }`}
                      >
                        {b.type === NotificationType.PROMOTION ? "Promo" : "System"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                      {b.body}
                    </p>
                    <p className="mt-1.5 text-[0.7rem] font-semibold text-stone-400 dark:text-stone-500">
                      {audienceLabel(b.audience)} · {b.recipients} recipients ·{" "}
                      {timeAgo(b.createdAt)} · by {b.sentBy.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
