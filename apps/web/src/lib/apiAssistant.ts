import type {
  BidSanityResult,
  BriefCoachResult,
  DiaryDigest,
  ProposalDraft,
} from "@buildora/shared";
import { request } from "./api";

/**
 * The inline AI helpers — the ones attached to a page rather than to the
 * floating chat.
 *
 * Each is triggered by an explicit button press. None of them poll, debounce or
 * fire on render, because each call spends a free-tier model quota that the
 * whole platform shares.
 */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface BriefCoachInput {
  areaName: string;
  landAreaKatha?: number;
  buildingType?: string;
  floors?: number;
  budgetMinBdt?: number;
  budgetMaxBdt?: number;
  roadWidthFt?: number;
  unitsPerFloor?: number;
  bedroomsPerUnit?: number;
  parkingSpaces?: number;
  soilTestDone?: boolean;
  ownershipDocsReady?: boolean;
  description?: string;
}

/**
 * POST /api/assistant/brief-coach — checks a half-filled brief against the real
 * DAP zoning table. The checks come back whether or not the AI answered.
 */
export async function coachBrief(token: string, input: BriefCoachInput): Promise<BriefCoachResult> {
  const res = await request<{ data: { coach: BriefCoachResult } }>("/api/assistant/brief-coach", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.coach;
}

/**
 * POST /api/projects/:id/proposal-draft — drafts a cover letter from the brief
 * and the architect's own stored portfolio. Nothing is submitted; the text
 * lands in the form for them to edit.
 */
export async function draftProposal(
  token: string,
  projectId: string,
  tone: "formal" | "warm"
): Promise<ProposalDraft> {
  const res = await request<{ data: { draft: ProposalDraft } }>(
    `/api/projects/${projectId}/proposal-draft`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ tone }) }
  );
  return res.data.draft;
}

/**
 * GET /api/projects/:id/diary/digest — a week of the site diary, counted.
 * `weekOf` is any date in the wanted week; the server snaps it to the Saturday.
 */
export async function getDiaryDigest(
  token: string,
  projectId: string,
  weekOf?: string
): Promise<DiaryDigest> {
  const query = weekOf ? `?weekOf=${encodeURIComponent(weekOf)}` : "";
  const res = await request<{ data: { digest: DiaryDigest } }>(
    `/api/projects/${projectId}/diary/digest${query}`,
    { headers: authed(token) }
  );
  return res.data.digest;
}

/**
 * POST /api/tenders/:id/bid-check — the contractor's private check on their own
 * draft rates. Comes back as directions and bands; there is no benchmark figure
 * in the response, by design.
 */
export async function checkBid(
  token: string,
  tenderId: string,
  lines: { itemId: string; ratePerUnitBdt: number }[],
  timelineWeeks?: number
): Promise<BidSanityResult> {
  const res = await request<{ data: { check: BidSanityResult } }>(
    `/api/tenders/${tenderId}/bid-check`,
    {
      method: "POST",
      headers: authed(token),
      body: JSON.stringify({ lines, timelineWeeks }),
    }
  );
  return res.data.check;
}
