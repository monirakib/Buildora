import type { PermitApplication, PermitApplicationAdminView, PermitType } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** GET /api/permit-applications?projectId=... — a project's Planning + Construction applications. */
export async function listPermitApplications(
  token: string,
  projectId: string
): Promise<PermitApplication[]> {
  const res = await request<{ data: { applications: PermitApplication[] } }>(
    `/api/permit-applications?projectId=${projectId}`,
    { headers: authed(token) }
  );
  return res.data.applications;
}

/** POST /api/permit-applications — start tracking a permit type for a project. */
export async function createPermitApplication(
  token: string,
  projectId: string,
  permitType: PermitType
): Promise<PermitApplication> {
  const res = await request<{ data: { application: PermitApplication } }>(
    "/api/permit-applications",
    { method: "POST", headers: authed(token), body: JSON.stringify({ projectId, permitType }) }
  );
  return res.data.application;
}

/** PATCH /api/permit-applications/:id — update the self-reported status/reference/dates. */
export async function updatePermitApplication(
  token: string,
  id: string,
  input: {
    status?: string;
    referenceNumber?: string;
    submittedDate?: string;
    approvedDate?: string;
  }
): Promise<PermitApplication> {
  const res = await request<{ data: { application: PermitApplication } }>(
    `/api/permit-applications/${id}`,
    { method: "PATCH", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.application;
}

/** POST /api/permit-applications/:id/documents — attach a document uploaded via /api/uploads/document. */
export async function addPermitDocument(
  token: string,
  id: string,
  input: { key: string; name: string; fileUrl: string }
): Promise<PermitApplication> {
  const res = await request<{ data: { application: PermitApplication } }>(
    `/api/permit-applications/${id}/documents`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.application;
}

/** DELETE /api/permit-applications/:id/documents/:key */
export async function removePermitDocument(
  token: string,
  id: string,
  key: string
): Promise<PermitApplication> {
  const res = await request<{ data: { application: PermitApplication } }>(
    `/api/permit-applications/${id}/documents/${encodeURIComponent(key)}`,
    { method: "DELETE", headers: authed(token) }
  );
  return res.data.application;
}

/** GET /api/permit-applications/admin/pending — applications awaiting admin confirmation. Admin-only. */
export async function listPendingPermitApplications(
  token: string
): Promise<PermitApplicationAdminView[]> {
  const res = await request<{ data: { applications: PermitApplicationAdminView[] } }>(
    "/api/permit-applications/admin/pending",
    { headers: authed(token) }
  );
  return res.data.applications;
}

/** PATCH /api/permit-applications/:id/verify — admin confirms the application. Admin-only. */
export async function verifyPermitApplication(
  token: string,
  id: string,
  verificationNote?: string
): Promise<PermitApplication> {
  const res = await request<{ data: { application: PermitApplication } }>(
    `/api/permit-applications/${id}/verify`,
    { method: "PATCH", headers: authed(token), body: JSON.stringify({ verificationNote }) }
  );
  return res.data.application;
}
