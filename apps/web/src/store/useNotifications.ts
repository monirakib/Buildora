"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import { NOTIFICATION_EVENTS, type AppNotification, type NotificationType } from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";
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

// Live socket + the token it was opened with. Module variables, not store
// state: nothing renders from them, so they'd only cause pointless re-renders.
let socket: Socket | null = null;
let socketToken: string | null = null;

export const useNotifications = create<NotificationState>((set, get) => {
  /** Opens the push channel for this login (no-op if already open for it). */
  function connect(token: string) {
    if (socket && socketToken === token) return;
    socket?.disconnect();
    socketToken = token;
    // forceNew keeps this connection separate from the call signaling socket,
    // which shares the same server URL.
    socket = io(API_BASE_URL, { auth: { token }, forceNew: true });

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
      socketToken = null;
      set({ items: [], unreadCount: 0, filter: null });
    },
  };
});
