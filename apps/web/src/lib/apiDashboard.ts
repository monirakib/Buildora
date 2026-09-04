import type { DashboardSummary } from "@buildora/shared";
import { request } from "./api";

/** GET /api/dashboard/summary — everything the dashboard shows, per role. */
export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  const res = await request<{ data: { summary: DashboardSummary } }>("/api/dashboard/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.summary;
}
