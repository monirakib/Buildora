import type { StructuralEngagement } from "@buildora/shared";
import { request } from "./api";

/**
 * Structural engineering engagements — the step between an approved design and
 * a RAJUK permit.
 *
 * There's no "list engineers" call here on purpose: the professional directory
 * already serves any role, so the picker uses `listProfessionals({ role:
 * STRUCTURAL_ENGINEER })` from ./api rather than a second endpoint that would
 * do the same job.
 */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Every action returns the updated engagement, so they share this shape. */
async function action(
  token: string,
  path: string,
  body?: Record<string, unknown>
): Promise<StructuralEngagement> {
  const res = await request<{ data: { engagement: StructuralEngagement } }>(path, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(body ?? {}),
  });
  return res.data.engagement;
}

/** GET /api/structural/project/:id — null when nobody is engaged yet. */
export async function getProjectEngagement(
  token: string,
  projectId: string
): Promise<StructuralEngagement | null> {
  const res = await request<{ data: { engagement: StructuralEngagement | null } }>(
    `/api/structural/project/${projectId}`,
    { headers: authed(token) }
  );
  return res.data.engagement;
}

/** GET /api/structural/mine — engagements the signed-in user is part of. */
export async function listMyEngagements(token: string): Promise<StructuralEngagement[]> {
  const res = await request<{ data: { engagements: StructuralEngagement[] } }>(
    "/api/structural/mine",
    { headers: authed(token) }
  );
  return res.data.engagements;
}

/** POST /api/structural — the owner appoints a verified structural engineer. */
export function appointEngineer(
  token: string,
  input: { projectId: string; engineerId: string; feeBdt: number }
) {
  return action(token, "/api/structural", input);
}

/** POST /api/structural/:id/escrow — the owner funds the agreed fee. */
export function fundStructuralEscrow(
  token: string,
  id: string,
  method: string,
  reference: string
) {
  return action(token, `/api/structural/${id}/escrow`, { method, reference });
}

/** POST /api/structural/:id/submissions — the engineer submits a drawing set. */
export function submitDrawings(
  token: string,
  id: string,
  input: { title: string; note?: string; fileUrl: string; signature: string }
) {
  return action(token, `/api/structural/${id}/submissions`, input);
}

/** POST /api/structural/:id/review — the owner approves or asks for changes. */
export function reviewDrawings(
  token: string,
  id: string,
  decision: "approve" | "request-changes",
  note?: string
) {
  return action(token, `/api/structural/${id}/review`, { action: decision, note });
}

/** POST /api/structural/:id/comment — the project's architect leaves a note. */
export function commentOnDrawings(token: string, id: string, note: string) {
  return action(token, `/api/structural/${id}/comment`, { note });
}

/** POST /api/structural/:id/cancel — either side calls it off. */
export function cancelEngagement(token: string, id: string, reason?: string) {
  return action(token, `/api/structural/${id}/cancel`, { reason });
}
