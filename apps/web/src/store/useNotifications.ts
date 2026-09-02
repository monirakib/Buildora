"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import { NOTIFICATION_EVENTS, type AppNotification, type NotificationType } from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";
import { useSession } from "@/store/useSession";
import {
  clearNotifications as apiClear,
  deleteNotification as apiDelete,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/apiNotifications";

/**
 * The notification bell's state.
 *
 * Two things keep it current: one fetch when the bell mounts, and a Socket.IO
 * subscription that receives new notifications as the server creates them. The
 * socket is what makes the badge move without a refresh; the fetch is what
 * fills the list after a page load (and catches anything that arrived while
 * the tab was closed).
 *
 * This deliberately opens its own socket rather than sharing the calling one
 * in useCall — they have completely separate lifecycles, and a bug in the bell
 * must never be able to drop a call in progress. One extra WebSocket per tab
 * is a cheap price for that isolation.
 */
interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  /** Types the list is narrowed to; null = everything. */
  filter: NotificationType[] | null;

  /** Fetch the feed (and connect the socket if it isn't already). */
  load: (token: string) => Promise<void>;
  setFilter: (token: string, filter: NotificationType[] | null) => Promise<void>;
  markRead: (token: string, id: string) => Promise<void>;
  markAllRead: (token: string) => Promise<void>;
  dismiss: (token: string, id: string) => Promise<void>;
  clearAll: (token: string) => Promise<void>;
  /** Drop the socket and wipe the feed — called on logout. */
  disconnect: () => void;
}

// Live socket + who it was opened for. Module variables, not store state:
// nothing renders from them, so they'd only cause pointless re-renders.
//
// Keyed by user id rather than by token on purpose. Access tokens are rotated
// every few minutes now, and comparing tokens would tear the socket down and
// rebuild it on every rotation — for no reason, since the connection is already
// authenticated and it is still the same person.
let socket: Socket | null = null;
let socketUserId: string | null = null;

/**
 * Extra listeners riding on the same socket.
 *
 * The bell is not the only thing the server pushes — the chat thread wants its
 * own messages live too. Rather than opening a third WebSocket per tab (the
 * bell and the call signaller are already two), other features register here
 * and share this one.
 *
 * The registry is what makes that safe across a re-login: `connect()` throws
 * the old socket away and builds a new one, and every registered event is
 * re-bound onto it. A subscriber that just called `socket.on(...)` directly
 * would go silent at that point and never say so.
 */
const extraListeners = new Map<string, Set<(payload: unknown) => void>>();
const boundEvents = new Set<string>();

function bindEvent(event: string) {
  if (!socket || boundEvents.has(event)) return;
  boundEvents.add(event);
  // One socket handler per event, fanning out to the current subscribers —
  // so subscribing and unsubscribing never touches the socket itself.
  socket.on(event, (payload: unknown) => {
    for (const handler of extraListeners.get(event) ?? []) handler(payload);
  });
}

/**
 * Listen for a server event on the app socket. Returns the unsubscribe, which
 * an effect should call on cleanup.
 *
 * Safe to call before the socket exists: the event is bound as soon as one is
 * opened.
 */
export function onAppEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const handlers = extraListeners.get(event) ?? new Set<(payload: unknown) => void>();
  extraListeners.set(event, handlers);
  const wrapped = handler as (payload: unknown) => void;
  handlers.add(wrapped);
  bindEvent(event);
  return () => {
    handlers.delete(wrapped);
  };
}

export const useNotifications = create<NotificationState>((set, get) => {
  /** Opens the push channel for this login (no-op if already open for it). */
  function connect(token: string) {
    const userId = useSession.getState().user?.id ?? null;
    if (socket && socketUserId === userId) return;
    socket?.disconnect();
    socketUserId = userId;
    // forceNew keeps this connection separate from the call signaling socket,
    // which shares the same server URL.
    //
    // `auth` is a callback rather than a fixed object because Socket.IO calls
    // it again on every reconnection attempt. With a fixed object it would keep
    // presenting the token from when the page loaded, which has since expired —
    // so a tab that lost its network for a minute could never reconnect.
    socket = io(API_BASE_URL, {
      auth: (cb) => cb({ token: useSession.getState().token ?? token }),
      forceNew: true,
    });

    // This is a brand new socket, so nothing is bound to it yet.
    boundEvents.clear();
    for (const event of extraListeners.keys()) bindEvent(event);

    socket.on(
      NOTIFICATION_EVENTS.created,
      ({ notification }: { notification: AppNotification }) => {
        set((state) => {
          // A collapsed message notification replaces its previous version, so
          // drop any row with the same id before prepending.
          const rest = state.items.filter((n) => n.id !== notification.id);
          const matchesFilter = !state.filter || state.filter.includes(notification.type);
          return {
            items: matchesFilter ? [notification, ...rest].slice(0, 30) : rest,
            unreadCount: state.unreadCount + 1,
          };
        });
      }
    );
  }

  return {
    items: [],
    unreadCount: 0,
    loading: false,
    filter: null,

    async load(token) {
      connect(token);
      set({ loading: true });
      try {
        const feed = await listNotifications(token, get().filter ?? undefined);
        set({ items: feed.items, unreadCount: feed.unreadCount, loading: false });
      } catch {
        // A failed poll shouldn't blank the bell — keep whatever we had.
        set({ loading: false });
      }
    },

    async setFilter(token, filter) {
      set({ filter, loading: true });
      try {
        const feed = await listNotifications(token, filter ?? undefined);
        set({ items: feed.items, unreadCount: feed.unreadCount, loading: false });
      } catch {
        set({ loading: false });
      }
    },

    async markRead(token, id) {
      const target = get().items.find((n) => n.id === id);
      if (!target || target.readAt) return; // already read — nothing to do
      // Optimistic: the badge should drop the instant you click, not after a
      // round trip. The next load reconciles if the request failed.
      set((state) => ({
        items: state.items.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
      await markNotificationRead(token, id).catch(() => {});
    },

    async markAllRead(token) {
      const now = new Date().toISOString();
      set((state) => ({
        items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
        unreadCount: 0,
      }));
      await markAllNotificationsRead(token).catch(() => {});
    },

    async dismiss(token, id) {
      const target = get().items.find((n) => n.id === id);
      set((state) => ({
        items: state.items.filter((n) => n.id !== id),
        // Dismissing something unread also takes it off the badge.
        unreadCount:
          target && !target.readAt ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }));
      await apiDelete(token, id).catch(() => {});
    },

    async clearAll(token) {
      set({ items: [], unreadCount: 0 });
      await apiClear(token).catch(() => {});
    },

    disconnect() {
      socket?.disconnect();
      socket = null;
      socketUserId = null;
      // The handlers stay registered — the components holding them are still
      // mounted — but nothing is bound any more, so the next connect() rebinds.
      boundEvents.clear();
      set({ items: [], unreadCount: 0, filter: null });
    },
  };
});
