import type { CostEstimate, DeliveryEstimate, EstimateSnapshot } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface EstimateResponse {
  estimate: CostEstimate;
  /** Plain-language name for the accuracy tier, e.g. "From your floor plans". */
  tierLabel: string;
  /** Newest first, so the owner can see the figure tighten as the project moved. */
  history: EstimateSnapshot[];
}

/**
 * POST /api/projects/:id/estimate — the current estimate and the history behind
 * it.
 *
 * The figure itself is recalculated and stored whenever the project gains real
 * data (a floor plan saved, a BOQ published, bidding closed), so this is a read
 * rather than a calculation. The floor area is no longer passed in: the server
 * picks the best source it has, and says which one it used.
 */
export async function estimateProject(token: string, projectId: string): Promise<EstimateResponse> {
  const res = await request<{ data: EstimateResponse }>(`/api/projects/${projectId}/estimate`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data;
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
  const res = await request<{ data: { shareToken: string } }>(`/api/projects/${projectId}/share`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ rotate }),
  });
  return res.data.shareToken;
}

export async function disableProjectShare(token: string, projectId: string): Promise<void> {
  await request(`/api/projects/${projectId}/share`, { method: "DELETE", headers: authed(token) });
}
