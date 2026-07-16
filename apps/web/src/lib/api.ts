import type {
  AchievementEntry,
  EducationEntry,
  Inquiry,
  Paginated,
  PortfolioProject,
  ProfessionalProfile,
  PublicProfessional,
  SessionUser,
  UserRole,
  VerificationRequest,
  VerificationStatus,
} from "@buildora/shared";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApiHealth {
  status: string;
  service: string;
  database: string;
  uptime: number;
}

/** User + JWT returned by the register and login endpoints. */
export interface AuthResult {
  user: SessionUser;
  token: string;
}

// Exported so the domain modules (apiProjects, apiMessages, apiPermits) share
// the same fetch + error-shaping behaviour.
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    // The API replies with { error: { message } } — surface that message so
    // forms can show "Invalid email or password" instead of a status code.
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function getApiHealth() {
  return request<ApiHealth>("/api/health");
}

export async function registerLandOwner(input: {
  name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<AuthResult> {
  const res = await request<{ data: AuthResult }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

/**
 * Professional signup (architect/engineer/contractor/supplier). Sends the
 * account fields, the chosen role, and the credential fields as raw form
 * strings; the API coerces numbers and drops blanks.
 */
export async function registerProfessional(input: Record<string, string>): Promise<AuthResult> {
  const res = await request<{ data: AuthResult }>("/api/auth/register-professional", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function loginUser(input: {
  identifier: string;
  password: string;
}): Promise<AuthResult> {
  const res = await request<{ data: AuthResult }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

/**
 * PATCH /api/auth/profile — values arrive as raw form strings; the API
 * coerces numbers and treats blanks as "clear this field".
 */
export async function updateProfile(
  token: string,
  input: Record<string, string>
): Promise<SessionUser> {
  const res = await request<{ data: { user: SessionUser } }>("/api/auth/profile", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.user;
}

export async function getMe(token: string): Promise<SessionUser> {
  const res = await request<{ data: { user: SessionUser } }>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.user;
}

/** GET /api/professionals — public directory, defaults to architects. */
export async function listProfessionals(params: {
  role?: UserRole;
  search?: string;
  specialty?: string;
  page?: number;
}): Promise<Paginated<PublicProfessional>> {
  const q = new URLSearchParams();
  if (params.role) q.set("role", params.role);
  if (params.search) q.set("search", params.search);
  if (params.specialty) q.set("specialty", params.specialty);
  if (params.page) q.set("page", String(params.page));
  const res = await request<{ data: Paginated<PublicProfessional> }>(
    `/api/professionals?${q.toString()}`
  );
  return res.data;
}

/** GET /api/professionals/:id — one professional's public profile. */
export async function getProfessional(id: string): Promise<PublicProfessional> {
  const res = await request<{ data: { professional: PublicProfessional } }>(
    `/api/professionals/${id}`
  );
  return res.data.professional;
}

/** POST /api/inquiries — a land owner contacts an architect. */
export async function createInquiry(
  token: string,
  input: { architectId: string; message: string }
): Promise<Inquiry> {
  const res = await request<{ data: { inquiry: Inquiry } }>("/api/inquiries", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.inquiry;
}

/** GET /api/inquiries/mine — sent (land owner) or received (professional). */
export async function listMyInquiries(token: string): Promise<Inquiry[]> {
  const res = await request<{ data: { inquiries: Inquiry[] } }>("/api/inquiries/mine", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.inquiries;
}

/**
 * Structured payload for the professional profile editor and the architect
 * verification wizard. Numeric fields may arrive as raw form strings — the
 * API's zod schema coerces them.
 */
export type ProfessionalProfileInput = Omit<Partial<ProfessionalProfile>, "yearsExperience"> & {
  name: string;
  phone: string;
  yearsExperience?: string | number;
  education: EducationEntry[];
  achievements: AchievementEntry[];
  portfolio: PortfolioProject[];
};

/** PATCH /api/professionals/me/profile — the professional's own editor. */
export async function updateProfessionalProfile(
  token: string,
  input: ProfessionalProfileInput
): Promise<SessionUser> {
  const res = await request<{ data: { user: SessionUser } }>("/api/professionals/me/profile", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.user;
}

/**
 * POST /api/uploads/image — sends the file as multipart form data (not via
 * request(), which forces a JSON content-type) and returns the hosted URL.
 */
export async function uploadImage(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE_URL}/api/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Upload failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

/** POST /api/verification/submit — send the profile for supervisor review. */
export async function submitVerification(
  token: string,
  message: string
): Promise<VerificationRequest> {
  const res = await request<{ data: { request: VerificationRequest } }>(
    "/api/verification/submit",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    }
  );
  return res.data.request;
}

/** GET /api/verification/mine — the professional's latest request, if any. */
export async function getMyVerification(token: string): Promise<VerificationRequest | null> {
  const res = await request<{ data: { request: VerificationRequest | null } }>(
    "/api/verification/mine",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

/** GET /api/verification/requests — supervisor queue, filtered by status. */
export async function listVerificationRequests(
  token: string,
  status: VerificationStatus
): Promise<VerificationRequest[]> {
  const res = await request<{ data: { requests: VerificationRequest[] } }>(
    `/api/verification/requests?status=${status}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.requests;
}

/** GET /api/verification/requests/:id — request + the full professional account. */
export async function getVerificationRequest(
  token: string,
  id: string
): Promise<{ request: VerificationRequest; professional: SessionUser }> {
  const res = await request<{
    data: { request: VerificationRequest; professional: SessionUser };
  }>(`/api/verification/requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

/** POST /api/verification/requests/:id/decide — approve or reject with a note. */
export async function decideVerificationRequest(
  token: string,
  id: string,
  action: "approve" | "reject",
  note: string
): Promise<VerificationRequest> {
  const res = await request<{ data: { request: VerificationRequest } }>(
    `/api/verification/requests/${id}/decide`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, note }),
    }
  );
  return res.data.request;
}
