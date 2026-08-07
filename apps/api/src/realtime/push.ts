import type { Server } from "socket.io";

/**
 * The one place that knows about the running Socket.IO server.
 *
 * `signaling.ts` registers the server here on startup; everything else (REST
 * controllers asking who's online, the notification service pushing to a user)
 * reads it through these helpers. Keeping the reference in its own module is
 * what lets the notification service push without importing the signaling
 * server — which would be a circular import, since signaling itself notifies
 * about missed calls.
 */
let ioRef: Server | null = null;

/** Called once, by attachSignaling, as the server comes up. */
export function registerIo(io: Server) {
  ioRef = io;
}

/** The room every one of a user's tabs joins, so we can reach all their devices. */
export function userRoom(userId: string) {
  return `user:${userId}`;
}

/**
 * True when at least one of the user's tabs is connected. Presence is derived
 * from live sockets rather than stored, so it can never get stuck "online" —
 * if the socket is gone, so is the green dot.
 */
export function isUserOnline(userId: string) {
  const room = ioRef?.sockets.adapter.rooms.get(userRoom(userId));
  return !!room && room.size > 0;
}

/**
 * Pushes an event to every tab the user has open. A no-op when they're offline
 * — a notification is already saved in MongoDB by the time this is called, so
 * they'll still see it the next time they load a page.
 */
export function emitToUser(userId: string, event: string, payload: unknown) {
  ioRef?.to(userRoom(userId)).emit(event, payload);
}
