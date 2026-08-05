import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import type { CallPeer, CallRecord, IceServerConfig, UserRole } from "@buildora/shared";
import { env } from "../config/env";
import { Call, type CallDoc } from "../models/Call";

type ParticipantRef = {
  _id: unknown;
  name: string;
  username: string;
  role: UserRole;
  profile?: { avatarUrl?: string };
};

const withParticipants = [
  { path: "caller", select: "name username role profile.avatarUrl" },
  { path: "callee", select: "name username role profile.avatarUrl" },
];

function toPeer(ref: ParticipantRef): CallPeer {
  return {
    id: String(ref._id),
    name: ref.name,
    username: ref.username,
    role: ref.role,
    avatarUrl: ref.profile?.avatarUrl,
  };
}

/** Shapes a call for the viewer: direction and `peer` are relative to them. */
function toCallRecord(doc: HydratedDocument<CallDoc>, callerId: string, me: string): CallRecord {
  const caller = doc.caller as unknown as ParticipantRef;
  const callee = doc.callee as unknown as ParticipantRef;
  const outgoing = callerId === me;
  return {
    id: doc._id.toString(),
    direction: outgoing ? "OUTGOING" : "INCOMING",
    peer: toPeer(outgoing ? callee : caller),
    status: doc.status,
    media: doc.media,
    startedAt: doc.createdAt.toISOString(),
    answeredAt: doc.answeredAt?.toISOString(),
    endedAt: doc.endedAt?.toISOString(),
    durationSec: doc.durationSec,
  };
}

/**
 * GET /api/calls/ice-config — the ICE servers the browser's RTCPeerConnection
 * needs. Built from env so a TURN relay can be added later without a client
 * change. Requires auth so the (eventually credentialed) TURN details aren't
 * handed to anonymous visitors.
 */
export function getIceConfig(_req: Request, res: Response) {
  const iceServers: IceServerConfig[] = [{ urls: env.STUN_URLS.split(",").map((s) => s.trim()) }];
  if (env.TURN_URL) {
    iceServers.push({
      urls: env.TURN_URL,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return res.json({ data: { iceServers } });
}

/** GET /api/calls — the caller's recent call history, newest first. */
export async function listRecentCalls(req: Request, res: Response) {
  const me = req.auth!.sub;
  const docs = await Call.find({ $or: [{ caller: me }, { callee: me }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate(withParticipants);

  const calls = docs.map((doc) =>
    toCallRecord(doc, String((doc.caller as unknown as ParticipantRef)._id), me)
  );
  return res.json({ data: { calls } });
}
