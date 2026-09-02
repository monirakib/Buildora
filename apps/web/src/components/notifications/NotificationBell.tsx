"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ClipboardList,
  FileText,
  Gavel,
  HardHat,
  Info,
  Inbox,
  Megaphone,
  MessageSquare,
  PhoneMissed,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { NotificationType, type AppNotification } from "@buildora/shared";
import { timeAgo } from "@/components/admin/format";
import { useNotifications } from "@/store/useNotifications";
import { useSession } from "@/store/useSession";
import { avatarAt } from "@/lib/imageUrl";

/** Fallback refresh, in case a socket push is missed (sleep, flaky network). */
const POLL_EVERY_MS = 60_000;

/**
 * Icon + accent colour per notification kind. Colour is never the only signal —
 * the icon differs too — so the feed still reads correctly for colour-blind
 * users and in high-contrast mode.
 */
const TYPE_STYLES: Record<
  NotificationType,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  [NotificationType.MESSAGE]: {
    icon: MessageSquare,
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  [NotificationType.INQUIRY]: {
    icon: Inbox,
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  [NotificationType.PROPOSAL]: {
    icon: FileText,
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  [NotificationType.CONTRACT]: {
    icon: FileText,
    tone: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  },
  [NotificationType.MEETING]: {
    icon: CalendarClock,
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  [NotificationType.TENDER]: {
    icon: Gavel,
    tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  [NotificationType.BID]: {
    icon: Gavel,
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  [NotificationType.MILESTONE]: {
    icon: HardHat,
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  },
  [NotificationType.SITE_DIARY]: {
    icon: ClipboardList,
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  },
  [NotificationType.PAYMENT]: {
    icon: Wallet,
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  [NotificationType.ORDER]: {
    icon: ShoppingCart,
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  },
  [NotificationType.VERIFICATION]: {
    icon: ShieldCheck,
    tone: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
  },
  [NotificationType.CALL]: {
    icon: PhoneMissed,
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  [NotificationType.PROMOTION]: {
    icon: Megaphone,
    tone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  },
  [NotificationType.SYSTEM]: {
    icon: Info,
    tone: "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-300",
  },
};

/**
 * The filter chips. Each one stands for a group of types, so the user picks
 * between four plain choices instead of all ten kinds: person-to-person
 * contact, everything about the actual work, and announcements.
 */
const FILTERS: { label: string; types: NotificationType[] | null }[] = [
  { label: "All", types: null },
  { label: "Messages", types: [NotificationType.MESSAGE, NotificationType.CALL] },
  {
    label: "Updates",
    types: [
      NotificationType.INQUIRY,
      NotificationType.PROPOSAL,
      NotificationType.CONTRACT,
      NotificationType.PAYMENT,
      NotificationType.ORDER,
      NotificationType.VERIFICATION,
      NotificationType.SITE_DIARY,
      NotificationType.TENDER,
      NotificationType.BID,
      NotificationType.MILESTONE,
    ],
  },
  { label: "Offers", types: [NotificationType.PROMOTION, NotificationType.SYSTEM] },
];

/** The coloured square (or the sender's photo) at the left of a row. */
function RowIcon({ notification }: { notification: AppNotification }) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES[NotificationType.SYSTEM];
  const Icon = style.icon;

  // A message from a person reads better with their face on it.
  if (notification.type === NotificationType.MESSAGE && notification.actor?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny avatar, remote host unknown
      <img
        src={avatarAt(notification.actor.avatarUrl, 72)}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-9 w-9 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${style.tone}`}>
      <Icon className="h-4.5 w-4.5" />
    </span>
  );
}

/** Shared styling for the two small icon actions at the right of a row. */
const rowActionClass =
  "grid h-6 w-6 place-items-center rounded-lg text-stone-400 opacity-70 transition hover:bg-stone-200 hover:text-stone-700 focus-visible:opacity-100 group-hover:opacity-100 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white";

function NotificationRow({
  notification,
  onMarkRead,
  onOpen,
  onDismiss,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onOpen: (n: AppNotification) => void;
  onDismiss: (id: string) => void;
}) {
  const unread = !notification.readAt;
  return (
    <li
      className={`group relative flex gap-3 px-3 py-3 transition ${
        unread ? "bg-amber-400/8 dark:bg-amber-400/6" : ""
      } hover:bg-stone-100 dark:hover:bg-white/5`}
    >
      <RowIcon notification={notification} />

      {/* The whole row is the click target. A button (not a link) because it
          also has to mark the notification read before navigating. */}
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={`truncate text-sm ${
            unread
              ? "font-extrabold text-stone-900 dark:text-white"
              : "font-semibold text-stone-700 dark:text-stone-300"
          }`}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          {notification.body}
        </p>
        <p className="mt-1 text-[0.7rem] font-semibold text-stone-400 dark:text-stone-500">
          {timeAgo(notification.createdAt)}
        </p>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {/* Unread dot — the same signal as the bold title, for redundancy */}
        {unread && <span className="mt-1.5 mr-2 h-2 w-2 rounded-full bg-amber-500" aria-hidden />}

        {/* Row actions. Kept visible (just dimmed) rather than hover-only:
            there is no hover on a phone, and these would be unreachable. */}
        <div className="mt-auto flex items-center gap-0.5">
          {/* Marking read without opening — the row itself navigates away, so
              this is the only way to clear one you don't want to act on. */}
          {unread && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              aria-label="Mark as read"
              title="Mark as read"
              className={rowActionClass}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
            className={rowActionClass}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * The navbar notification bell: an icon with an unread badge, and a dropdown
 * holding the feed. New notifications arrive over a Socket.IO push (see
 * useNotifications), with a slow poll as a safety net.
 *
 * `tone` matches the bar it sits in — "dark" for the landing navbar's glass
 * pill, "surface" for the admin console's themed top bar. Renders nothing at
 * all when nobody is signed in.
 */
export function NotificationBell({ tone = "dark" }: { tone?: "dark" | "surface" }) {
  const router = useRouter();
  const token = useSession((s) => s.token);
  const userId = useSession((s) => s.user?.id ?? null);
  const hasToken = useSession((s) => Boolean(s.token));
  const items = useNotifications((s) => s.items);
  const unreadCount = useNotifications((s) => s.unreadCount);
  const loading = useNotifications((s) => s.loading);
  const filter = useNotifications((s) => s.filter);
  const load = useNotifications((s) => s.load);
  const setFilter = useNotifications((s) => s.setFilter);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const dismiss = useNotifications((s) => s.dismiss);
  const clearAll = useNotifications((s) => s.clearAll);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load once the session is known, then keep a slow poll running as a fallback
  // for anything the socket missed (laptop asleep, connection dropped).
  //
  // Depends on the user, not on the token's value: tokens rotate every few
  // minutes, and re-running on each one would refetch the feed and restart the
  // interval every time — a poll that keeps getting reset never fires. The
  // token is read fresh on each tick instead.
  useEffect(() => {
    if (!userId || !hasToken) return;
    const current = () => useSession.getState().token;
    const first = current();
    if (!first) return;
    load(first);
    const timer = setInterval(() => {
      const live = current();
      if (live) load(live);
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [userId, hasToken, load]);

  // Close on Escape or a click outside the dropdown.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleOpen = useCallback(
    (notification: AppNotification) => {
      if (!token) return;
      markRead(token, notification.id);
      // Only close when we're actually navigating somewhere. A notification
      // with nothing to open (an announcement, say) just gets marked read and
      // leaves the panel up, so the user can keep working through the list.
      if (notification.link) {
        setOpen(false);
        router.push(notification.link);
      }
    },
    [token, markRead, router]
  );

  if (!token) return null;

  // The bell sits in its own circle. In the navbar that's the same glass disc
  // the theme toggle and account chip use, so the three read as one set; in the
  // admin bar it's a plain tinted disc that works on both themes.
  const buttonTone =
    tone === "dark"
      ? "border-white/25 bg-white/15 text-white/85 backdrop-blur hover:border-white/40 hover:bg-white/25 hover:text-white"
      : "border-black/5 bg-stone-200/70 text-stone-600 hover:bg-stone-300/70 hover:text-stone-900 dark:border-white/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/20 dark:hover:text-white";

  // The badge overlaps the circle's edge, so it needs a ring in the colour of
  // whatever is behind the disc to punch itself out cleanly.
  const badgeRing = tone === "dark" ? "ring-stone-950/40" : "ring-white dark:ring-stone-950";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative grid h-9 w-9 place-items-center rounded-full border transition ${buttonTone}`}
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-amber-400 px-1 text-[0.6rem] font-extrabold text-stone-950 shadow ring-2 ${badgeRing}`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // Width is capped to the viewport so the panel never causes sideways
        // scrolling on a phone.
        <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-stone-950">
          <div className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-extrabold text-stone-900 dark:text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-stone-950">
                  {unreadCount}
                </span>
              )}
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead(token)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto border-b border-black/10 px-3 py-2 dark:border-white/10">
            {FILTERS.map((f) => {
              // A chip is active when the store holds exactly its group. Both
              // are fixed lists, so comparing the joined names is enough.
              const active = (filter?.join(",") ?? "") === (f.types?.join(",") ?? "");
              return (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setFilter(token, f.types)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
                    active
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-950"
                      : "bg-stone-100 text-stone-600 hover:text-stone-900 dark:bg-white/10 dark:text-stone-300 dark:hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
                Loading…
              </p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-stone-300 dark:text-stone-600" />
                <p className="mt-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                  Nothing here yet
                </p>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-500">
                  Messages, project updates and offers will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onMarkRead={(id) => markRead(token, id)}
                    onOpen={handleOpen}
                    onDismiss={(id) => dismiss(token, id)}
                  />
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t border-black/10 p-2 dark:border-white/10">
              <button
                type="button"
                onClick={() => clearAll(token)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-red-500/10 hover:text-red-600 dark:text-stone-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
