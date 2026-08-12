import type {
  BuildContract,
  InspectionTemplate,
  InspectionVerdict,
  Milestone,
} from "@buildora/shared";
import { request } from "./api";

/** Small helper — every call in this module is authenticated. */
function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** One load of the construction panel. */
export interface BuildResult {
  contract: BuildContract | null;
  milestones: Milestone[];
}

/** GET /api/projects/:id/build — the build contract and its schedule. */
export async function getProjectBuild(token: string, projectId: string): Promise<BuildResult> {
  const res = await request<{ data: BuildResult }>(`/api/projects/${projectId}/build`, {
    headers: authed(token),
  });
  return res.data;
}

/** GET /api/build/mine — every build contract the caller is a party to. */
export async function listMyBuildContracts(token: string): Promise<BuildContract[]> {
  const res = await request<{ data: { contracts: BuildContract[] } }>("/api/build/mine", {
    headers: authed(token),
  });
  return res.data.contracts;
}

/** GET /api/build/inspection-templates — the checklists an engineer can use. */
export async function listInspectionTemplates(token: string): Promise<InspectionTemplate[]> {
  const res = await request<{ data: { templates: InspectionTemplate[] } }>(
    "/api/build/inspection-templates",
    { headers: authed(token) }
  );
  return res.data.templates;
}

/** Record a tranche paid outside the gateway. */
export async function fundMilestone(
  token: string,
  contractId: string,
  milestoneId: string,
  body: { method: string; reference: string }
): Promise<BuildResult> {
  const res = await request<{ data: BuildResult }>(
    `/api/build/${contractId}/milestones/${milestoneId}/fund`,
    { method: "POST", headers: authed(token), body: JSON.stringify(body) }
  );
  return res.data;
}

/** The contractor says a stage is finished and wants it inspected. */
export async function claimMilestone(
  token: string,
  contractId: string,
  milestoneId: string
): Promise<Milestone[]> {
  const res = await request<{ data: { milestones: Milestone[] } }>(
    `/api/build/${contractId}/milestones/${milestoneId}/claim`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.milestones;
}

/** What an engineer files when they sign off (or fail) a stage. */
export interface InspectionInput {
  templateName: string;
  results: { label: string; passed: boolean; note?: string }[];
  verdict: InspectionVerdict;
  notes?: string;
  photoUrls: string[];
  signature: string;
  location?: { lat: number; lng: number; address?: string };
}

/** POST an inspection against a milestone. */
export async function inspectMilestone(
  token: string,
  contractId: string,
  milestoneId: string,
  input: InspectionInput
): Promise<Milestone[]> {
  const res = await request<{ data: { milestones: Milestone[] } }>(
    `/api/build/${contractId}/milestones/${milestoneId}/inspect`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.milestones;
}

/** The owner pays out a passed stage. */
export async function releaseMilestone(
  token: string,
  contractId: string,
  milestoneId: string
): Promise<BuildResult & { completed: boolean }> {
  const res = await request<{ data: BuildResult & { completed: boolean } }>(
    `/api/build/${contractId}/milestones/${milestoneId}/release`,
    { method: "POST", headers: authed(token) }
  );
  return res.data;
}

/** Retitle or date a stage that hasn't been funded yet. */
export async function updateMilestone(
  token: string,
  contractId: string,
  milestoneId: string,
  body: { title: string; description?: string; targetDate?: string }
): Promise<Milestone[]> {
  const res = await request<{ data: { milestones: Milestone[] } }>(
    `/api/build/${contractId}/milestones/${milestoneId}`,
    { method: "PATCH", headers: authed(token), body: JSON.stringify(body) }
  );
  return res.data.milestones;
}
