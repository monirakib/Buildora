import type {
  AccountSession,
  AchievementEntry,
  EducationEntry,
  IabCheck,
  Inquiry,
  NidCheck,
  Paginated,
  PortfolioProject,
  ProfessionalProfile,
  PublicProfessional,
  Review,
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

/**
 * An error the API itself returned, with the status attached. Callers that only
 * show `err.message` keep working; the ones that care about *why* (mainly
 * "was this a 401?") can check the status instead of matching on text.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason, when the API sends one (e.g. "IAB_NAME_MISMATCH"). */
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
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
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ?? `API request failed: ${res.status} ${res.statusText}`,
      res.status,
      body?.error?.code
    );
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

/**
 * PATCH /api/auth/account — account settings shared by every role: personal
 * details, extra contact points, and billing. Unlike the profile endpoints
 * this merges into the profile subdocument, so a professional saving their
 * billing address doesn't wipe their credentials.
 */
export async function updateAccount(
  token: string,
  input: Record<string, string>
): Promise<SessionUser> {
  const res = await request<{ data: { user: SessionUser } }>("/api/auth/account", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.user;
}

/** POST /api/auth/change-email — swap the login email (needs the password). */
export async function changeEmail(
  token: string,
  input: { email: string; currentPassword: string }
): Promise<SessionUser> {
  const res = await request<{ data: { user: SessionUser } }>("/api/auth/change-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.user;
}

/** POST /api/auth/verify-email/send — mail myself a fresh confirmation link. */
export async function sendVerificationEmail(
  token: string
): Promise<{ sentTo: string; expiresInHours: number }> {
  const res = await request<{ data: { sentTo: string; expiresInHours: number } }>(
    "/api/auth/verify-email/send",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

/**
 * POST /api/auth/verify-email — hand back a token from a mailed link.
 *
 * No Authorization header: the link is often opened on a device that isn't
 * signed in, and the token is the proof by itself.
 */
export async function verifyEmail(
  verificationToken: string
): Promise<{ email: string; alreadyVerified: boolean }> {
  const res = await request<{ data: { email: string; alreadyVerified: boolean } }>(
    "/api/auth/verify-email",
    { method: "POST", body: JSON.stringify({ token: verificationToken }) }
  );
  return res.data;
}

/**
 * POST /api/auth/change-password — set a new password. Signs out every other
 * session server-side; this one stays alive.
 */
export async function changePassword(
  token: string,
  input: { currentPassword: string; newPassword: string; confirmPassword: string }
): Promise<void> {
  await request<{ data: { ok: boolean } }>("/api/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

/** GET /api/auth/sessions — every login currently able to use this account. */
export async function listSessions(token: string): Promise<AccountSession[]> {
  const res = await request<{ data: { sessions: AccountSession[] } }>("/api/auth/sessions", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.sessions;
}

/**
 * POST /api/auth/sessions/revoke — end other logins. Takes an array so the
 * device list can sign out a whole selection in one request; returns how many
 * were actually revoked.
 */
export async function revokeSessions(token: string, ids: string[]): Promise<number> {
  const res = await request<{ data: { revoked: number } }>("/api/auth/sessions/revoke", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids }),
  });
  return res.data.revoked;
}

/**
 * POST /api/auth/logout — revoke this login's session server-side so the JWT
 * stops working everywhere, not just in this browser's localStorage.
 */
export async function logoutUser(token: string): Promise<void> {
  await request<{ data: { ok: boolean } }>("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
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
  /** Include professionals a supervisor hasn't approved. Off by default. */
  includeUnverified?: boolean;
  /** Expertise chips — a professional matches if they hold any of them. */
  expertise?: string[];
  division?: string;
  district?: string;
  /** 1–5; excludes anyone not yet rated. */
  minRating?: number;
  sort?: "rating" | "experience";
}): Promise<Paginated<PublicProfessional>> {
  const q = new URLSearchParams();
  if (params.role) q.set("role", params.role);
  if (params.search) q.set("search", params.search);
  if (params.specialty) q.set("specialty", params.specialty);
  if (params.page) q.set("page", String(params.page));
  if (params.includeUnverified) q.set("includeUnverified", "true");
  // Repeated key — the API reads every value, not just the last.
  for (const area of params.expertise ?? []) q.append("expertise", area);
  if (params.division) q.set("division", params.division);
  if (params.district) q.set("district", params.district);
  if (params.minRating) q.set("minRating", String(params.minRating));
  if (params.sort) q.set("sort", params.sort);
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

/**
 * POST /api/nid/check — runs the NID pre-screen against the caller's own saved
 * profile. Takes no body on purpose: the API reads the number, date of birth
 * and card image already on the account, so the browser can't have one set of
 * details checked and a different set stored.
 */
export async function runNidCheck(token: string): Promise<NidCheck> {
  const res = await request<{ data: { check: NidCheck } }>("/api/nid/check", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.check;
}

/** GET /api/professionals/:id/reviews — public, newest first. */
export async function listArchitectReviews(id: string): Promise<Review[]> {
  const res = await request<{ data: { reviews: Review[] } }>(`/api/professionals/${id}/reviews`);
  return res.data.reviews;
}

/** GET /api/contracts/:id/review — the land owner's own review, or null. */
export async function getMyReview(token: string, contractId: string): Promise<Review | null> {
  const res = await request<{ data: { review: Review | null } }>(
    `/api/contracts/${contractId}/review`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.review;
}

/** POST /api/contracts/:id/review — rate the architect on a completed contract. */
export async function submitReview(
  token: string,
  contractId: string,
  input: { rating: number; comment?: string }
): Promise<Review> {
  const res = await request<{ data: { review: Review } }>(`/api/contracts/${contractId}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  return res.data.review;
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

/** POST /api/uploads/model — upload a .glb 3D design model, get its URL. */
export async function uploadModel(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("model", file);
  const res = await fetch(`${API_BASE_URL}/api/uploads/model`, {
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
  message: string,
  /** Bypass the automated IAB name check and go straight to a supervisor. */
  manualReview = false
): Promise<VerificationRequest> {
  const res = await request<{ data: { request: VerificationRequest } }>(
    "/api/verification/submit",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, manualReview }),
    }
  );
  return res.data.request;
}

/**
 * Look a membership number up in the IAB directory.
 *
 * Signed-in callers (the wizard, the supervisor) go through
 * /api/verification/iab. The signup form has no token yet, so it uses the
 * rate-limited copy mounted on the auth router. Pass `name` to have the reply
 * say whether it matches the name on the IAB record.
 */
export async function checkIabMembership(
  membershipNo: string,
  opts: { token?: string; name?: string } = {}
): Promise<IabCheck> {
  const query = new URLSearchParams({ membershipNo });
  if (opts.name) query.set("name", opts.name);

  const path = opts.token ? "/api/verification/iab" : "/api/auth/iab";
  const res = await request<{ data: { check: IabCheck } }>(`${path}?${query.toString()}`, {
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
  });
  return res.data.check;
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

// ---------- Buildora Guide (AI assistant) ----------

export interface AssistantMessage {
  role: "user" | "model";
  content: string;
}

/**
 * POST /api/assistant/chat — ask the Buildora Guide one question. Guests pass
 * their running history (kept in the widget's state); signed-in users send a
 * token instead and the API uses their stored conversation.
 */
export async function assistantChat(
  token: string | null,
  message: string,
  history: AssistantMessage[]
): Promise<string> {
  const res = await request<{ data: { reply: string } }>("/api/assistant/chat", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(token ? { message } : { message, history }),
  });
  return res.data.reply;
}

/** GET /api/assistant/chat — the signed-in user's stored conversation. */
export async function getAssistantChat(token: string): Promise<AssistantMessage[]> {
  const res = await request<{ data: { messages: AssistantMessage[] } }>("/api/assistant/chat", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.messages;
}

/** DELETE /api/assistant/chat — wipe the signed-in user's conversation. */
export async function clearAssistantChat(token: string): Promise<void> {
  await request<{ data: { ok: boolean } }>("/api/assistant/chat", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
