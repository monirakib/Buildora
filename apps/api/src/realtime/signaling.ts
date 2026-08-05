import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { isValidObjectId } from "mongoose";
import { Server, type Socket } from "socket.io";
import {
  CALL_EVENTS,
  CallMedia,
  CallStatus,
  type CallDescriptionPayload,
  type CallIcePayload,
  type CallMediaStatePayload,
  type CallPeer,
  type CallRenegotiatePayload,
  type CallStartPayload,
} from "@buildora/shared";
import type { AuthPayload } from "../middleware/auth";
import { env } from "../config/env";
import { Call } from "../models/Call";
import { touchSession } from "../models/Session";
import { User } from "../models/User";

/** The room every one of a user's tabs joins, so we can ring all their devices. */
function userRoom(userId: string) {
  return `user:${userId}`;
}

// The running signaling server, kept here so REST controllers (e.g. the message
// inbox) can ask who is online without holding a reference themselves.
let ioRef: Server | null = null;

/**
 * True when at least one of the user's tabs is connected. Presence is derived
 * from live sockets rather than stored, so it can never get stuck "online" —
 * if the socket is gone, so is the green dot.
 */
export function isUserOnline(userId: string) {
  const room = ioRef?.sockets.adapter.rooms.get(userRoom(userId));
  return !!room && room.size > 0;
}

/** Stamps "last seen" so an offline user can be shown as "Active 5 mins ago". */
async function touchLastSeen(userId: string) {
  await User.updateOne({ _id: userId }, { lastSeenAt: new Date() }).catch(() => null);
}

/**
 * Attaches the WebRTC signaling server to the shared HTTP server. Audio flows
 * peer-to-peer between browsers; this server only carries the signaling — who's
 * calling whom, accept/reject, and the SDP/ICE handshake — plus it writes each
 * call to the DB as history.
 */
export function attachSignaling(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });
  ioRef = io;

  // Active calls kept in memory so we can route each signal to the right peer
  // and enforce that only participants can signal on a call. The DB row is the
  // durable record; this map is just the live routing table.
  const activeCalls = new Map<string, { caller: string; callee: string }>();

  // Refresh "last seen" for everyone currently connected, so the timestamp is
  // still about right if the server stops without clean disconnects. `unref()`
  // keeps this timer from holding the process open.
  setInterval(() => {
    const ids = [...io.sockets.sockets.values()].map((s) => s.data.userId as string);
    if (ids.length === 0) return;
    User.updateMany({ _id: { $in: ids } }, { lastSeenAt: new Date() }).catch(() => null);
  }, 60_000).unref();

  /** Given a call and one participant, returns the other participant's id. */
  function peerOf(callId: string, me: string): string | null {
    const call = activeCalls.get(callId);
    if (!call) return null;
    if (call.caller === me) return call.callee;
    if (call.callee === me) return call.caller;
    return null; // not a participant — ignore the signal
  }

  /**
   * Finalizes a call: stamps the terminal status (and talk time if it was
   * answered) on the DB row and drops it from the live map.
   */
  async function finalize(callId: string, status: CallStatus) {
    activeCalls.delete(callId);
    const call = await Call.findById(callId).catch(() => null);
    if (!call || call.endedAt) return;
    call.status = status;
    call.endedAt = new Date();
    if (call.answeredAt) {
      call.durationSec = Math.max(
        0,
        Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      );
    }
    await call.save().catch(() => null);
  }

  // --- Handshake auth: verify the JWT and its session, exactly like the REST
  // requireAuth middleware, then remember who this socket belongs to. ---
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Authentication required"));
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

      if (payload.sid) {
        const session = await touchSession(payload.sid, payload.sub);
        if (!session) return next(new Error("Session expired"));
      }

      const user = await User.findById(payload.sub).select("name username role profile.avatarUrl");
      if (!user) return next(new Error("User not found"));

      socket.data.userId = payload.sub;
      socket.data.me = {
        id: payload.sub,
        name: user.name,
        username: user.username,
        role: user.role,
        avatarUrl: user.profile?.avatarUrl,
      } satisfies CallPeer;
      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const me: string = socket.data.userId;
    const meInfo: CallPeer = socket.data.me;
    socket.join(userRoom(me));
    touchLastSeen(me);

    // Caller dials someone. Acks with { callId } so the caller can track the
    // call it just started, or { error } when the callee can't be reached.
    socket.on(
      CALL_EVENTS.start,
      async (
        payload: CallStartPayload,
        ack?: (res: { callId?: string; error?: string }) => void
      ) => {
        const toUserId = payload?.toUserId;
        if (!toUserId || !isValidObjectId(toUserId) || toUserId === me) {
          return ack?.({ error: "Invalid call target" });
        }
        const callee = await User.findById(toUserId).select("_id");
        if (!callee) return ack?.({ error: "User not found" });

        // Only the two kinds are accepted; anything else is treated as voice.
        const media = payload?.media === CallMedia.VIDEO ? CallMedia.VIDEO : CallMedia.AUDIO;
        const call = await Call.create({
          caller: me,
          callee: toUserId,
          status: CallStatus.RINGING,
          media,
        });
        const callId = call._id.toString();

        if (!isUserOnline(toUserId)) {
          await finalize(callId, CallStatus.MISSED);
          return ack?.({ error: "User is offline" });
        }

        activeCalls.set(callId, { caller: me, callee: toUserId });
        io.to(userRoom(toUserId)).emit(CALL_EVENTS.incoming, { callId, from: meInfo, media });
        return ack?.({ callId });
      }
    );

    // Callee picks up. Tell the caller so it starts the WebRTC offer.
    socket.on(CALL_EVENTS.accept, async ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      if (!call || call.callee !== me) return;
      await Call.findByIdAndUpdate(callId, {
        status: CallStatus.ACCEPTED,
        answeredAt: new Date(),
      }).catch(() => null);
      io.to(userRoom(call.caller)).emit(CALL_EVENTS.accepted, { callId });
    });

    // Callee declines the invite.
    socket.on(CALL_EVENTS.reject, async ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      if (!call || call.callee !== me) return;
      io.to(userRoom(call.caller)).emit(CALL_EVENTS.rejected, { callId });
      await finalize(callId, CallStatus.REJECTED);
    });

    // Caller gives up before the callee answered.
    socket.on(CALL_EVENTS.cancel, async ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      if (!call || call.caller !== me) return;
      io.to(userRoom(call.callee)).emit(CALL_EVENTS.cancelled, { callId });
      await finalize(callId, CallStatus.CANCELLED);
    });

    // Either party hangs up. If it had connected it's a normal end; if it was
    // still ringing, it counts as a cancel (caller) or reject (callee).
    socket.on(CALL_EVENTS.hangup, async ({ callId }: { callId: string }) => {
      const call = activeCalls.get(callId);
      const other = peerOf(callId, me);
      if (!call || !other) return;
      io.to(userRoom(other)).emit(CALL_EVENTS.ended, { callId });
      const record = await Call.findById(callId)
        .select("status")
        .catch(() => null);
      const wasAnswered = record?.status === CallStatus.ACCEPTED;
      await finalize(
        callId,
        wasAnswered
          ? CallStatus.ENDED
          : call.caller === me
            ? CallStatus.CANCELLED
            : CallStatus.REJECTED
      );
    });

    // --- Pure relay: forward the SDP offer/answer and ICE candidates to the
    // other participant. The server never inspects the media, just routes it. ---
    socket.on(CALL_EVENTS.offer, (payload: CallDescriptionPayload) => {
      const other = peerOf(payload?.callId, me);
      if (other) io.to(userRoom(other)).emit(CALL_EVENTS.peerOffer, payload);
    });
    socket.on(CALL_EVENTS.answer, (payload: CallDescriptionPayload) => {
      const other = peerOf(payload?.callId, me);
      if (other) io.to(userRoom(other)).emit(CALL_EVENTS.peerAnswer, payload);
    });
    socket.on(CALL_EVENTS.ice, (payload: CallIcePayload) => {
      const other = peerOf(payload?.callId, me);
      if (other) io.to(userRoom(other)).emit(CALL_EVENTS.peerIce, payload);
    });
    // "My camera/screen went on or off." The video track is negotiated once at
    // the start of the call and swapped underneath, so this note is how the
    // other side knows whether to show a video tile or the camera-off avatar.
    socket.on(CALL_EVENTS.mediaState, (payload: CallMediaStatePayload) => {
      const other = peerOf(payload?.callId, me);
      if (other) io.to(userRoom(other)).emit(CALL_EVENTS.peerMediaState, payload);
    });
    // The callee asking the caller for a fresh offer after its tracks changed.
    socket.on(CALL_EVENTS.renegotiate, (payload: CallRenegotiatePayload) => {
      const other = peerOf(payload?.callId, me);
      if (other) io.to(userRoom(other)).emit(CALL_EVENTS.peerRenegotiate, payload);
    });

    // A dropped connection ends any calls this tab was on — but only if the
    // user has no other tab still connected (so a refresh doesn't kill a call).
    socket.on("disconnect", async () => {
      // Stamped on every tab close: whichever one goes last leaves the correct
      // "last seen" behind, which is what the offline label counts from.
      await touchLastSeen(me);
      if (isUserOnline(me)) return;
      for (const [callId, call] of activeCalls) {
        if (call.caller !== me && call.callee !== me) continue;
        const other = call.caller === me ? call.callee : call.caller;
        io.to(userRoom(other)).emit(CALL_EVENTS.ended, { callId });
        const record = await Call.findById(callId)
          .select("status")
          .catch(() => null);
        await finalize(
          callId,
          record?.status === CallStatus.ACCEPTED ? CallStatus.ENDED : CallStatus.MISSED
        );
      }
    });
  });

  return io;
}
