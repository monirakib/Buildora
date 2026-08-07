import type { NotificationFeed, NotificationType } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * GET /api/notifications — the bell's feed. `types` narrows the list (each
 * filter chip stands for a group of types); the unread count it returns is
 * always the account total, so the badge doesn't change when a filter is on.
 */
export async function listNotifications(
  token: string,
  types?: NotificationType[]
): Promise<NotificationFeed> {
  const query = types?.length ? `?type=${types.join(",")}` : "";
  const res = await request<{ data: NotificationFeed }>(`/api/notifications${query}`, {
    headers: authed(token),
  });
  return res.data;
}

/** GET /api/notifications/unread-count — just the badge number. */
export async function getNotificationCount(token: string): Promise<number> {
  const res = await request<{ data: { count: number } }>("/api/notifications/unread-count", {
    headers: authed(token),
  });
  return res.data.count;
}

/** POST /api/notifications/:id/read — mark one as read. */
export async function markNotificationRead(token: string, id: string): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/notifications/${id}/read`, {
    method: "POST",
    headers: authed(token),
  });
}

/** POST /api/notifications/read-all — clear the badge. */
export async function markAllNotificationsRead(token: string): Promise<void> {
  await request<{ data: { updated: number } }>("/api/notifications/read-all", {
    method: "POST",
    headers: authed(token),
  });
}

/** DELETE /api/notifications/:id — dismiss one for good. */
export async function deleteNotification(token: string, id: string): Promise<void> {
  await request<{ data: { ok: boolean } }>(`/api/notifications/${id}`, {
    method: "DELETE",
    headers: authed(token),
  });
}

/** DELETE /api/notifications — empty the whole feed. */
export async function clearNotifications(token: string): Promise<void> {
  await request<{ data: { deleted: number } }>("/api/notifications", {
    method: "DELETE",
    headers: authed(token),
  });
}
