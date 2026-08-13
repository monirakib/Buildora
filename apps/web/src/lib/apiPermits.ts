import type { DapZone, EcpsStep, FeeEstimate, FeeRule } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------- Public tools ----------

/** GET /api/permits/dap-zones?search= — public zone lookup. */
export async function listDapZones(search: string): Promise<DapZone[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await request<{ data: { zones: DapZone[] } }>(`/api/permits/dap-zones${q}`);
  return res.data.zones;
}

/**
 * GET /api/permits/dap-zone-for — the single zone governing a locality, or null
 * when no zone record covers it. Used by the brief form once the plot's area is
 * known; the wider /dap-zones search is for people browsing by hand.
 */
export async function findDapZoneFor(area: string, signal?: AbortSignal): Promise<DapZone | null> {
  const res = await request<{ data: { zone: DapZone | null } }>(
    `/api/permits/dap-zone-for?area=${encodeURIComponent(area)}`,
    { signal }
  );
  return res.data.zone;
}

/** GET /api/permits/fee-rules — the current RAJUK rate table. */
export async function listFeeRules(): Promise<FeeRule[]> {
  const res = await request<{ data: { rules: FeeRule[] } }>("/api/permits/fee-rules");
  return res.data.rules;
}

/** POST /api/permits/fee-estimate — server-computed fee from the rate table. */
export async function estimateFee(input: {
  category: string;
  floorAreaSqm: string | number;
}): Promise<FeeEstimate> {
  const res = await request<{ data: { estimate: FeeEstimate } }>("/api/permits/fee-estimate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data.estimate;
}

/** GET /api/permits/ecps-steps — the guide steps, in walking order. */
export async function listEcpsSteps(): Promise<EcpsStep[]> {
  const res = await request<{ data: { steps: EcpsStep[] } }>("/api/permits/ecps-steps");
  return res.data.steps;
}

// ---------- Admin CRUD (supervisor only) ----------

/** POST or PATCH /api/permits/dap-zones — create or update a zone record. */
export async function saveDapZone(
  token: string,
  input: Record<string, string>,
  id?: string
): Promise<DapZone> {
  const res = await request<{ data: { zone: DapZone } }>(
    id ? `/api/permits/dap-zones/${id}` : "/api/permits/dap-zones",
    { method: id ? "PATCH" : "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.zone;
}

/** DELETE /api/permits/dap-zones/:id */
export async function deleteDapZone(token: string, id: string): Promise<void> {
  await request(`/api/permits/dap-zones/${id}`, { method: "DELETE", headers: authed(token) });
}

/** POST or PATCH /api/permits/fee-rules — create or update a rate. */
export async function saveFeeRule(
  token: string,
  input: Record<string, string>,
  id?: string
): Promise<FeeRule> {
  const res = await request<{ data: { rule: FeeRule } }>(
    id ? `/api/permits/fee-rules/${id}` : "/api/permits/fee-rules",
    { method: id ? "PATCH" : "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.rule;
}

/** DELETE /api/permits/fee-rules/:id */
export async function deleteFeeRule(token: string, id: string): Promise<void> {
  await request(`/api/permits/fee-rules/${id}`, { method: "DELETE", headers: authed(token) });
}

/** POST or PATCH /api/permits/ecps-steps — create or update a step. */
export async function saveEcpsStep(
  token: string,
  input: { order: string; title: string; description: string; requiredDocuments: string[] },
  id?: string
): Promise<EcpsStep> {
  const res = await request<{ data: { step: EcpsStep } }>(
    id ? `/api/permits/ecps-steps/${id}` : "/api/permits/ecps-steps",
    { method: id ? "PATCH" : "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.step;
}

/** DELETE /api/permits/ecps-steps/:id */
export async function deleteEcpsStep(token: string, id: string): Promise<void> {
  await request(`/api/permits/ecps-steps/${id}`, { method: "DELETE", headers: authed(token) });
}
