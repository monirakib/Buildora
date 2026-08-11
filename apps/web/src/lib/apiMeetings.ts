import type { Availability, Meeting, MeetingMode, SlotDay } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** What an architect's booking calendar looks like to a land owner. */
export interface ArchitectSlots {
  bookable: boolean;
  /** Why not, when `bookable` is false — shown as-is. */
  reason?: string;
  slotMinutes?: number;
  officeAddress?: string;
  days: SlotDay[];
}

/** GET /api/meetings/architects/:id/slots — their open times. */
export async function getArchitectSlots(token: string, architectId: string) {
  const res = await request<{ data: ArchitectSlots }>(
    `/api/meetings/architects/${architectId}/slots`,
    { headers: authed(token) }
  );
  return res.data;
}

/** GET /api/meetings/availability — the architect's own hours. */
export async function getMyAvailability(token: string) {
  const res = await request<{ data: { availability: Availability; officeAddress?: string } }>(
    "/api/meetings/availability",
    { headers: authed(token) }
  );
  return res.data;
}

/** PUT /api/meetings/availability — replace them. */
export async function saveMyAvailability(
  token: string,
  input: Omit<Availability, "updatedAt">
): Promise<Availability> {
  const res = await request<{ data: { availability: Availability } }>(
    "/api/meetings/availability",
    { method: "PUT", headers: authed(token), body: JSON.stringify(input) }
  );
  return res.data.availability;
}

export interface BookMeetingInput {
  architectId: string;
  /** ISO instant of the chosen slot. */
  startAt: string;
  mode: MeetingMode;
  agenda?: string;
  /** In-person only. */
  venueChoice?: "OFFICE" | "PROPOSE";
  venuePlace?: string;
}

/** POST /api/meetings — take a slot. */
export async function bookMeeting(token: string, input: BookMeetingInput): Promise<Meeting> {
  const res = await request<{ data: { meeting: Meeting } }>("/api/meetings", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.meeting;
}

/** GET /api/meetings — every meeting the signed-in user is on. */
export async function listMyMeetings(token: string): Promise<Meeting[]> {
  const res = await request<{ data: { meetings: Meeting[] } }>("/api/meetings", {
    headers: authed(token),
  });
  return res.data.meetings;
}

/** The venue and lifecycle actions all return the updated meeting. */
async function meetingAction(
  token: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Meeting> {
  const res = await request<{ data: { meeting: Meeting } }>(path, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(body ?? {}),
  });
  return res.data.meeting;
}

/** Counter with a different place. */
export const proposeVenue = (token: string, id: string, place: string) =>
  meetingAction(token, `/api/meetings/${id}/venue`, { place });

/** Agree to the place currently on the table. */
export const acceptVenue = (token: string, id: string) =>
  meetingAction(token, `/api/meetings/${id}/venue/accept`);

/** End the negotiation at the architect's office. */
export const chooseOfficeVenue = (token: string, id: string) =>
  meetingAction(token, `/api/meetings/${id}/venue/office`);

export const cancelMeeting = (token: string, id: string, reason?: string) =>
  meetingAction(token, `/api/meetings/${id}/cancel`, { reason });

export const rescheduleMeeting = (token: string, id: string, startAt: string) =>
  meetingAction(token, `/api/meetings/${id}/reschedule`, { startAt });
