import type { AttendanceSummary, LabourTrade, SiteCheckIn } from "@buildora/shared";
import { request } from "./api";

/** Geofenced site attendance — the headcount captured on the plot, as it happens. */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface AttendanceDay {
  checkIns: SiteCheckIn[];
  summary: AttendanceSummary;
}

export async function listAttendance(
  token: string,
  projectId: string,
  date?: string
): Promise<AttendanceDay> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await request<{ data: AttendanceDay }>(
    `/api/projects/${projectId}/attendance${query}`,
    { headers: authed(token) }
  );
  return res.data;
}

export async function checkIn(
  token: string,
  projectId: string,
  input: { trade: LabourTrade; count: number; lat: number; lng: number; note?: string }
): Promise<SiteCheckIn> {
  const res = await request<{ data: { checkIn: SiteCheckIn } }>(
    `/api/projects/${projectId}/attendance`,
    { method: "POST", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.checkIn;
}

export async function checkOut(
  token: string,
  projectId: string,
  checkInId: string
): Promise<SiteCheckIn> {
  const res = await request<{ data: { checkIn: SiteCheckIn } }>(
    `/api/projects/${projectId}/attendance/${checkInId}/out`,
    { method: "POST", headers: authed(token) }
  );
  return res.data.checkIn;
}

export async function deleteCheckIn(
  token: string,
  projectId: string,
  checkInId: string
): Promise<void> {
  await request(`/api/projects/${projectId}/attendance/${checkInId}`, {
    method: "DELETE",
    headers: authed(token),
  });
}

/**
 * Reads this device's position once.
 *
 * Wrapped in a promise with an explicit timeout because the browser's callback
 * API can hang indefinitely when permission is granted but no fix is available
 * — which on a building site, surrounded by concrete, is common.
 */
export function currentPosition(timeoutMs = 15000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't report its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked — allow it in your browser to check in"
              : "Couldn't get a location fix. Try again outside."
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
