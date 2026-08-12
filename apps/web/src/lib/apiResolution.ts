import type {
  ChangeOrder,
  Dispute,
  DisputeResolution,
  DisputeScope,
  Handover,
} from "@buildora/shared";
import { request } from "./api";

/** Disputes, change orders and handover — the three "not to plan" paths. */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/* ---------- Disputes ---------- */

export interface RaiseDisputeInput {
  scope: DisputeScope;
  targetId: string;
  reason: string;
  amountClaimedBdt?: number;
  evidence?: { caption: string; fileUrl: string }[];
}

export async function raiseDispute(token: string, input: RaiseDisputeInput): Promise<Dispute> {
  const res = await request<{ data: { dispute: Dispute } }>("/api/disputes", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.dispute;
}

/** GET /api/projects/:id/disputes — everything filed on one project. */
export async function listProjectDisputes(token: string, projectId: string): Promise<Dispute[]> {
  const res = await request<{ data: { disputes: Dispute[] } }>(
    `/api/projects/${projectId}/disputes`,
    { headers: authed(token) }
  );
  return res.data.disputes;
}

/** GET /api/disputes?status= — the supervisor's queue. */
export async function listDisputes(token: string, status?: string): Promise<Dispute[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await request<{ data: { disputes: Dispute[] } }>(`/api/disputes${query}`, {
    headers: authed(token),
  });
  return res.data.disputes;
}

export async function getDispute(token: string, id: string): Promise<Dispute> {
  const res = await request<{ data: { dispute: Dispute } }>(`/api/disputes/${id}`, {
    headers: authed(token),
  });
  return res.data.dispute;
}

export async function withdrawDispute(token: string, id: string): Promise<Dispute> {
  const res = await request<{ data: { dispute: Dispute } }>(`/api/disputes/${id}/withdraw`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data.dispute;
}

export async function resolveDispute(
  token: string,
  id: string,
  input: { resolution: DisputeResolution; note: string; refundBdt?: number }
): Promise<Dispute> {
  const res = await request<{ data: { dispute: Dispute } }>(`/api/disputes/${id}/resolve`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.dispute;
}

/* ---------- Change orders ---------- */

export async function listChangeOrders(
  token: string,
  buildContractId: string
): Promise<ChangeOrder[]> {
  const res = await request<{ data: { changeOrders: ChangeOrder[] } }>(
    `/api/build/${buildContractId}/change-orders`,
    { headers: authed(token) }
  );
  return res.data.changeOrders;
}

export async function proposeChangeOrder(
  token: string,
  buildContractId: string,
  input: {
    title: string;
    description: string;
    amountDeltaBdt: number;
    timelineDeltaWeeks: number;
  }
): Promise<ChangeOrder> {
  const res = await request<{ data: { changeOrder: ChangeOrder } }>(
    `/api/build/${buildContractId}/change-orders`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.changeOrder;
}

export async function decideChangeOrder(
  token: string,
  id: string,
  action: "approve" | "reject",
  note?: string
): Promise<ChangeOrder> {
  const res = await request<{ data: { changeOrder: ChangeOrder } }>(
    `/api/build/change-orders/${id}/decide`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ action, note }) }
  );
  return res.data.changeOrder;
}

export async function withdrawChangeOrder(token: string, id: string): Promise<ChangeOrder> {
  const res = await request<{ data: { changeOrder: ChangeOrder } }>(
    `/api/build/change-orders/${id}/withdraw`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.changeOrder;
}

/* ---------- Handover ---------- */

export async function getHandover(token: string, projectId: string): Promise<Handover | null> {
  const res = await request<{ data: { handover: Handover | null } }>(
    `/api/projects/${projectId}/handover`,
    { headers: authed(token) }
  );
  return res.data.handover;
}

export interface HandoverInput {
  occupancyCertificateNo?: string;
  occupancyCertificateUrl?: string;
  handedOverAt?: string;
  notes?: string;
  warranties: {
    item: string;
    provider: string;
    months: number;
    startsAt: string;
    documentUrl?: string;
  }[];
}

export async function saveHandover(
  token: string,
  projectId: string,
  input: HandoverInput
): Promise<Handover> {
  const res = await request<{ data: { handover: Handover } }>(
    `/api/projects/${projectId}/handover`,
    { method: "PUT", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.handover;
}

export async function acceptHandover(token: string, projectId: string): Promise<Handover> {
  const res = await request<{ data: { handover: Handover } }>(
    `/api/projects/${projectId}/handover/accept`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.handover;
}
