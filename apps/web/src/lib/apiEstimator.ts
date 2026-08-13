import type { CostEstimate, DeliveryEstimate } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** POST /api/projects/:id/estimate — priced from the BOQ table, explained by AI. */
export async function estimateProject(
  token: string,
  projectId: string,
  areaSqft?: number
): Promise<CostEstimate> {
  const res = await request<{ data: { estimate: CostEstimate } }>(
    `/api/projects/${projectId}/estimate`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ areaSqft }) }
  );
  return res.data.estimate;
}

/** GET /api/marketplace/products/:id/delivery?projectId= */
export async function estimateDelivery(
  token: string,
  productId: string,
  projectId: string
): Promise<DeliveryEstimate> {
  const res = await request<{ data: { delivery: DeliveryEstimate } }>(
    `/api/marketplace/products/${productId}/delivery?projectId=${encodeURIComponent(projectId)}`,
    { headers: authed(token) }
  );
  return res.data.delivery;
}

/* ---------- Public progress link ---------- */

export async function getProjectShare(token: string, projectId: string): Promise<string | null> {
  const res = await request<{ data: { shareToken: string | null } }>(
    `/api/projects/${projectId}/share`,
    { headers: authed(token) }
  );
  return res.data.shareToken;
}

export async function enableProjectShare(
  token: string,
  projectId: string,
  rotate = false
): Promise<string> {
  const res = await request<{ data: { shareToken: string } }>(
    `/api/projects/${projectId}/share`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ rotate }) }
  );
  return res.data.shareToken;
}

export async function disableProjectShare(token: string, projectId: string): Promise<void> {
  await request(`/api/projects/${projectId}/share`, { method: "DELETE", headers: authed(token) });
}
