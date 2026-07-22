import type { CallRecord, IceServerConfig } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** GET /api/calls/ice-config — STUN/TURN servers for the RTCPeerConnection. */
export async function getIceConfig(token: string): Promise<IceServerConfig[]> {
  const res = await request<{ data: { iceServers: IceServerConfig[] } }>("/api/calls/ice-config", {
    headers: authed(token),
  });
  return res.data.iceServers;
}

/** GET /api/calls — the signed-in user's recent call history, newest first. */
export async function listRecentCalls(token: string): Promise<CallRecord[]> {
  const res = await request<{ data: { calls: CallRecord[] } }>("/api/calls", {
    headers: authed(token),
  });
  return res.data.calls;
}
