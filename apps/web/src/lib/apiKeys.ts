import { request } from "./api";

/**
 * Client for /api/keys/* — encryption and integrity key rotation.
 *
 * ADMIN-only on the server (see apps/api/src/routes/keys.routes.ts). The whole
 * point of this surface: if a key is ever suspected leaked, add a new one to
 * the keyring env var, flip it active, redeploy, then use this to sweep every
 * record from the old key to the new one — decrypting with the old key and
 * re-encrypting with the new one, batch by batch, resumable if interrupted.
 */

export type RotationScope = "USER_PII" | "LEDGER_HMAC";
export type RotationStatus = "RUNNING" | "PAUSED" | "COMPLETED" | "VERIFIED" | "FAILED";

export interface RotationProgress {
  model: string;
  scanned: number;
  rewritten: number;
  done: boolean;
}

export interface RotationFailure {
  model: string;
  documentId: string;
  reason: string;
}

export interface KeyRotationRun {
  _id: string;
  scope: RotationScope;
  toVersion: string;
  status: RotationStatus;
  progress: RotationProgress[];
  failures: RotationFailure[];
  startedBy: string;
  finishedAt?: string;
  verifiedAt?: string;
  outstanding?: number;
  createdAt: string;
  updatedAt: string;
}

export interface KeyScopeStatus {
  versions: string[];
  active: string;
  outstanding: number;
}

export interface KeyStatus {
  data: KeyScopeStatus;
  ledger: KeyScopeStatus;
  jwt: { retireAfterMinutes: number; note: string };
  blindIndex: { rotatable: boolean; note: string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** GET /api/keys/status — which keys exist, which is active, and how much is still on an old one. */
export async function getKeyStatus(token: string): Promise<KeyStatus> {
  const res = await request<{ data: KeyStatus }>("/api/keys/status", { headers: auth(token) });
  return res.data;
}

/** GET /api/keys/rotations — recent runs, newest first. */
export async function listKeyRotations(token: string): Promise<KeyRotationRun[]> {
  const res = await request<{ data: { runs: KeyRotationRun[] } }>("/api/keys/rotations", {
    headers: auth(token),
  });
  return res.data.runs;
}

/** POST /api/keys/rotations — start converting everything on an old key to the active one. */
export async function startKeyRotation(
  token: string,
  scope: RotationScope
): Promise<{ run: KeyRotationRun; outstanding: number }> {
  const res = await request<{ data: { run: KeyRotationRun; outstanding: number } }>(
    "/api/keys/rotations",
    { method: "POST", headers: auth(token), body: JSON.stringify({ scope }) }
  );
  return res.data;
}

/** POST /api/keys/rotations/:id/resume — pick a paused run back up. */
export async function resumeKeyRotation(token: string, id: string): Promise<KeyRotationRun> {
  const res = await request<{ data: { run: KeyRotationRun } }>(`/api/keys/rotations/${id}/resume`, {
    method: "POST",
    headers: auth(token),
  });
  return res.data.run;
}

/** POST /api/keys/rotations/:id/verify — prove nothing is left on an old key. */
export async function verifyKeyRotation(
  token: string,
  id: string
): Promise<{ run: KeyRotationRun; safeToRetireOldKey: boolean }> {
  const res = await request<{ data: { run: KeyRotationRun; safeToRetireOldKey: boolean } }>(
    `/api/keys/rotations/${id}/verify`,
    { method: "POST", headers: auth(token) }
  );
  return res.data;
}
