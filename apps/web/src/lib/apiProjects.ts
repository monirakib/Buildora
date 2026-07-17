import type {
  Contract,
  EcpsApplication,
  Paginated,
  Project,
  ProjectDocument,
  ProjectStatus,
  Proposal,
} from "@buildora/shared";
import { request } from "./api";

/** Small helper — every call in this module is authenticated. */
function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ---------- Projects & briefs ----------

/** Raw form strings for the brief editor; the API coerces numbers. */
export interface BriefInput {
  title: string;
  description: string;
  address: string;
  areaName: string;
  landAreaKatha: string;
  buildingType: string;
  floors: string;
  budgetMinBdt?: string;
  budgetMaxBdt?: string;
  // Plot details
  roadWidthFt?: string;
  plotFacing?: string;
  existingStructure?: boolean;
  soilTestDone?: boolean;
  // Building requirements
  unitsPerFloor?: string;
  bedroomsPerUnit?: string;
  parkingSpaces?: string;
  hasLift?: boolean;
  hasBasement?: boolean;
  hasRooftopAmenities?: boolean;
  // Preferences & readiness
  designStyle?: string;
  timeline?: string;
  ownershipDocsReady?: boolean;
  photoUrls?: string[];
  /** true = post to architects right away; false/absent = keep as a draft. */
  publish?: boolean;
}

/** POST /api/projects — create a brief (publish immediately or keep as draft). */
export async function createProject(token: string, input: BriefInput): Promise<Project> {
  const res = await request<{ data: { project: Project } }>("/api/projects", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.project;
}

/** GET /api/projects/mine — own projects (owner) or assigned projects (professional). */
export async function listMyProjects(token: string): Promise<Project[]> {
  const res = await request<{ data: { projects: Project[] } }>("/api/projects/mine", {
    headers: authed(token),
  });
  return res.data.projects;
}

/** GET /api/projects/briefs — open briefs for professionals to browse. */
export async function listOpenBriefs(
  token: string,
  params: { search?: string; page?: number }
): Promise<Paginated<Project>> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<Project> }>(`/api/projects/briefs?${q.toString()}`, {
    headers: authed(token),
  });
  return res.data;
}

/** GET /api/projects/:id — one project. */
export async function getProject(token: string, id: string): Promise<Project> {
  const res = await request<{ data: { project: Project } }>(`/api/projects/${id}`, {
    headers: authed(token),
  });
  return res.data.project;
}

/** PATCH /api/projects/:id — edit the brief (before an architect is engaged). */
export async function updateProject(
  token: string,
  id: string,
  input: BriefInput
): Promise<Project> {
  const res = await request<{ data: { project: Project } }>(`/api/projects/${id}`, {
    method: "PATCH",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.project;
}

/** POST /api/projects/:id/post — publish a draft brief to architects. */
export async function postBrief(token: string, id: string): Promise<Project> {
  const res = await request<{ data: { project: Project } }>(`/api/projects/${id}/post`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data.project;
}

/** PATCH /api/projects/:id/status — owner advances permit → construction → done. */
export async function updateProjectStatus(
  token: string,
  id: string,
  status: ProjectStatus
): Promise<Project> {
  const res = await request<{ data: { project: Project } }>(`/api/projects/${id}/status`, {
    method: "PATCH",
    headers: authed(token),
    body: JSON.stringify({ status }),
  });
  return res.data.project;
}

/** DELETE /api/projects/:id — remove a brief that hasn't engaged an architect. */
export async function deleteProject(token: string, id: string): Promise<void> {
  await request<{ data: { deleted: boolean } }>(`/api/projects/${id}`, {
    method: "DELETE",
    headers: authed(token),
  });
}

// ---------- Proposals ----------

/** POST /api/projects/:id/proposals — an architect pitches on a brief. */
export async function createProposal(
  token: string,
  projectId: string,
  input: Record<string, string>
): Promise<Proposal> {
  const res = await request<{ data: { proposal: Proposal } }>(
    `/api/projects/${projectId}/proposals`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.proposal;
}

/** GET /api/projects/:id/proposals — all proposals (owner) or own (architect). */
export async function listProjectProposals(token: string, projectId: string): Promise<Proposal[]> {
  const res = await request<{ data: { proposals: Proposal[] } }>(
    `/api/projects/${projectId}/proposals`,
    { headers: authed(token) }
  );
  return res.data.proposals;
}

/** GET /api/proposals/mine — the architect's proposals across all briefs. */
export async function listMyProposals(token: string): Promise<Proposal[]> {
  const res = await request<{ data: { proposals: Proposal[] } }>("/api/proposals/mine", {
    headers: authed(token),
  });
  return res.data.proposals;
}

/** POST /api/proposals/:id/accept|decline|withdraw — decide a proposal. */
export async function decideProposal(
  token: string,
  id: string,
  action: "accept" | "decline" | "withdraw"
): Promise<Proposal> {
  const res = await request<{ data: { proposal: Proposal } }>(`/api/proposals/${id}/${action}`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data.proposal;
}

// ---------- Contracts & escrow ----------

/** GET /api/projects/:id/contract — the project's contract, if one exists. */
export async function getProjectContract(
  token: string,
  projectId: string
): Promise<Contract | null> {
  const res = await request<{ data: { contract: Contract | null } }>(
    `/api/projects/${projectId}/contract`,
    { headers: authed(token) }
  );
  return res.data.contract;
}

/** POST /api/contracts/:id/pay-concept-fee — sandbox payment of the concept fee. */
export async function payConceptFee(
  token: string,
  contractId: string,
  input: { method: string; reference: string }
): Promise<Contract> {
  const res = await request<{ data: { contract: Contract } }>(
    `/api/contracts/${contractId}/pay-concept-fee`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.contract;
}

/** POST /api/contracts/:id/fund-escrow — sandbox deposit of the design fee. */
export async function fundEscrow(
  token: string,
  contractId: string,
  input: { method: string; reference: string }
): Promise<Contract> {
  const res = await request<{ data: { contract: Contract } }>(
    `/api/contracts/${contractId}/fund-escrow`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.contract;
}

/** POST /api/contracts/:id/deliverables — the architect submits work for review. */
export async function submitDeliverable(
  token: string,
  contractId: string,
  input: { title: string; note: string; fileUrl: string }
): Promise<Contract> {
  const res = await request<{ data: { contract: Contract } }>(
    `/api/contracts/${contractId}/deliverables`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.contract;
}

/** POST /api/contracts/:id/deliverables/:index/decide — approve or request changes. */
export async function decideDeliverable(
  token: string,
  contractId: string,
  index: number,
  input: { action: "approve" | "request-changes"; note: string }
): Promise<Contract> {
  const res = await request<{ data: { contract: Contract } }>(
    `/api/contracts/${contractId}/deliverables/${index}/decide`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.contract;
}

/** POST /api/contracts/:id/cancel — the client backs out before escrow is funded. */
export async function cancelContract(token: string, contractId: string): Promise<Contract> {
  const res = await request<{ data: { contract: Contract } }>(
    `/api/contracts/${contractId}/cancel`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.contract;
}

// ---------- ECPS tracker ----------

/** GET /api/projects/:id/ecps — the permit application, or null if not started. */
export async function getEcpsApplication(
  token: string,
  projectId: string
): Promise<EcpsApplication | null> {
  const res = await request<{ data: { application: EcpsApplication | null } }>(
    `/api/projects/${projectId}/ecps`,
    { headers: authed(token) }
  );
  return res.data.application;
}

/** POST /api/projects/:id/ecps — start tracking at the first configured step. */
export async function startEcpsApplication(
  token: string,
  projectId: string
): Promise<EcpsApplication> {
  const res = await request<{ data: { application: EcpsApplication } }>(
    `/api/projects/${projectId}/ecps`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.application;
}

/** POST /api/projects/:id/ecps/advance — finish the current step (with a note). */
export async function advanceEcpsApplication(
  token: string,
  projectId: string,
  note: string
): Promise<EcpsApplication> {
  const res = await request<{ data: { application: EcpsApplication } }>(
    `/api/projects/${projectId}/ecps/advance`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ note }) }
  );
  return res.data.application;
}

// ---------- Document archive ----------

/** GET /api/projects/:id/documents — the archive, newest first. */
export async function listProjectDocuments(
  token: string,
  projectId: string
): Promise<ProjectDocument[]> {
  const res = await request<{ data: { documents: ProjectDocument[] } }>(
    `/api/projects/${projectId}/documents`,
    { headers: authed(token) }
  );
  return res.data.documents;
}

/** POST /api/projects/:id/documents — file an uploaded image or external link. */
export async function addProjectDocument(
  token: string,
  projectId: string,
  input: { title: string; category: string; fileUrl: string }
): Promise<ProjectDocument> {
  const res = await request<{ data: { document: ProjectDocument } }>(
    `/api/projects/${projectId}/documents`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.document;
}

/** DELETE /api/projects/:id/documents/:docId — uploader or owner removes it. */
export async function deleteProjectDocument(
  token: string,
  projectId: string,
  docId: string
): Promise<void> {
  await request<{ data: { deleted: boolean } }>(`/api/projects/${projectId}/documents/${docId}`, {
    method: "DELETE",
    headers: authed(token),
  });
}
