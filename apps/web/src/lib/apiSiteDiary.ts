import type {
  SiteDiaryEntry,
  SiteDiaryEntryEdit,
  SiteDiaryEntryInput,
  SiteDiarySummary,
  WeatherForecastDay,
} from "@buildora/shared";
import { request } from "./api";

/** Small helper — every call in this module is authenticated. */
function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** One load of the diary: every entry, the running totals, and the plot check. */
export interface SiteDiaryResult {
  entries: SiteDiaryEntry[];
  summary: SiteDiarySummary;
  /** False when the brief has no map pin, so no weather can be stamped. */
  hasPlotPin: boolean;
}

/** GET /api/projects/:id/diary — the whole diary, newest day first. */
export async function listSiteDiary(token: string, projectId: string): Promise<SiteDiaryResult> {
  const res = await request<{ data: SiteDiaryResult }>(`/api/projects/${projectId}/diary`, {
    headers: authed(token),
  });
  return res.data;
}

/**
 * GET /api/projects/:id/diary/forecast — the week ahead over the plot.
 *
 * Returns an empty list rather than throwing when the project has no map pin
 * (the API answers 409 there): the forecast strip is a bonus on top of the
 * diary, and a missing pin should hide it, not break the page.
 */
export async function getSiteForecast(
  token: string,
  projectId: string
): Promise<WeatherForecastDay[]> {
  try {
    const res = await request<{ data: { forecast: WeatherForecastDay[] } }>(
      `/api/projects/${projectId}/diary/forecast`,
      { headers: authed(token) }
    );
    return res.data.forecast;
  } catch {
    return [];
  }
}

/** POST /api/projects/:id/diary — log a day. */
export async function createSiteDiaryEntry(
  token: string,
  projectId: string,
  input: SiteDiaryEntryInput
): Promise<{ entry: SiteDiaryEntry; summary: SiteDiarySummary }> {
  const res = await request<{ data: { entry: SiteDiaryEntry; summary: SiteDiarySummary } }>(
    `/api/projects/${projectId}/diary`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data;
}

/** PATCH /api/projects/:id/diary/:entryId — correct a day's record. */
export async function updateSiteDiaryEntry(
  token: string,
  projectId: string,
  entryId: string,
  input: SiteDiaryEntryEdit
): Promise<{ entry: SiteDiaryEntry; summary: SiteDiarySummary }> {
  const res = await request<{ data: { entry: SiteDiaryEntry; summary: SiteDiarySummary } }>(
    `/api/projects/${projectId}/diary/${entryId}`,
    { method: "PATCH", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data;
}

/** DELETE /api/projects/:id/diary/:entryId — remove an entry. */
export async function deleteSiteDiaryEntry(
  token: string,
  projectId: string,
  entryId: string
): Promise<SiteDiarySummary> {
  const res = await request<{ data: { deleted: boolean; summary: SiteDiarySummary } }>(
    `/api/projects/${projectId}/diary/${entryId}`,
    { method: "DELETE", headers: authed(token) }
  );
  return res.data.summary;
}
