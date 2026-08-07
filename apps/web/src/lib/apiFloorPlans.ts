import type { FloorPlan, FloorPlanInput, PlanCompliance } from "@buildora/shared";
import { request } from "./api";

/** Small helper — every call in this module is authenticated. */
function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** What one load of the floor-plan editor needs: every floor plus the FAR check. */
export interface FloorPlansResult {
  plans: FloorPlan[];
  compliance: PlanCompliance;
  /** True for the project's architect (and admins); the owner reads only. */
  canEdit: boolean;
}

/** GET /api/projects/:id/floor-plans — all drawn floors, lowest level first. */
export async function listFloorPlans(
  token: string,
  projectId: string
): Promise<FloorPlansResult> {
  const res = await request<{ data: FloorPlansResult }>(
    `/api/projects/${projectId}/floor-plans`,
    { headers: authed(token) }
  );
  return res.data;
}

/**
 * PUT /api/projects/:id/floor-plans/:level — save one floor. The editor holds
 * the whole floor in state, so every save sends the complete geometry.
 */
export async function saveFloorPlan(
  token: string,
  projectId: string,
  input: FloorPlanInput
): Promise<{ plan: FloorPlan; compliance: PlanCompliance }> {
  const { level, ...geometry } = input;
  const res = await request<{ data: { plan: FloorPlan; compliance: PlanCompliance } }>(
    `/api/projects/${projectId}/floor-plans/${level}`,
    { method: "PUT", headers: authed(token), body: JSON.stringify(geometry) }
  );
  return res.data;
}

/** DELETE /api/projects/:id/floor-plans/:level — wipe one floor. */
export async function deleteFloorPlan(
  token: string,
  projectId: string,
  level: number
): Promise<PlanCompliance> {
  const res = await request<{ data: { deleted: boolean; compliance: PlanCompliance } }>(
    `/api/projects/${projectId}/floor-plans/${level}`,
    { method: "DELETE", headers: authed(token) }
  );
  return res.data.compliance;
}
