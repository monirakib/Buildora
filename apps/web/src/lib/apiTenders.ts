import type { Bid, BidComparison, Tender, TenderItem, TenderStatus } from "@buildora/shared";
import { request } from "./api";

/** Small helper — every call in this module is authenticated. */
function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** One line of the starter BOQ, before the owner edits it. */
export interface BoqTemplateItem {
  description: string;
  unit: string;
  quantity: number;
  guideRateBdt: number;
  category: string;
}

export interface BoqTemplate {
  builtAreaSqft: number;
  floorsDrawn: number;
  items: BoqTemplateItem[];
}

/** What the owner sends when drafting or editing a tender. */
export interface TenderInput {
  title: string;
  scope: string;
  items: Omit<TenderItem, "id">[];
  deadlineAt: string;
  siteVisitAt?: string;
}

/** A tender on the contractor's board, with whether they've already bid. */
export interface BoardTender extends Tender {
  alreadyBid?: boolean;
}

/** GET /api/projects/:id/boq-template — quantities derived from the floor plan. */
export async function getBoqTemplate(token: string, projectId: string): Promise<BoqTemplate> {
  const res = await request<{ data: BoqTemplate }>(`/api/projects/${projectId}/boq-template`, {
    headers: authed(token),
  });
  return res.data;
}

/** GET /api/projects/:id/tender — the project's tender, or null. */
export async function getProjectTender(token: string, projectId: string): Promise<Tender | null> {
  const res = await request<{ data: { tender: Tender | null } }>(
    `/api/projects/${projectId}/tender`,
    { headers: authed(token) }
  );
  return res.data.tender;
}

/** POST /api/projects/:id/tender — draft one. */
export async function createTender(
  token: string,
  projectId: string,
  input: TenderInput
): Promise<Tender> {
  const res = await request<{ data: { tender: Tender } }>(`/api/projects/${projectId}/tender`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.tender;
}

/** PATCH /api/tenders/:id — edit a draft. */
export async function updateTender(
  token: string,
  tenderId: string,
  input: TenderInput
): Promise<Tender> {
  const res = await request<{ data: { tender: Tender } }>(`/api/tenders/${tenderId}`, {
    method: "PATCH",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.tender;
}

/** One of the owner's lifecycle actions on a tender. */
async function tenderAction(
  token: string,
  tenderId: string,
  action: "publish" | "close" | "cancel"
): Promise<Tender> {
  const res = await request<{ data: { tender: Tender } }>(`/api/tenders/${tenderId}/${action}`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data.tender;
}

export const publishTender = (token: string, id: string) => tenderAction(token, id, "publish");
export const closeTender = (token: string, id: string) => tenderAction(token, id, "close");
export const cancelTender = (token: string, id: string) => tenderAction(token, id, "cancel");

/** GET /api/tenders — the contractor's board of open tenders. */
export async function listOpenTenders(token: string): Promise<BoardTender[]> {
  const res = await request<{ data: { tenders: BoardTender[] } }>("/api/tenders", {
    headers: authed(token),
  });
  return res.data.tenders;
}

/** GET /api/tenders/:id — one tender, as this caller may see it. */
export async function getTender(
  token: string,
  tenderId: string
): Promise<{ tender: Tender; myBidId?: string }> {
  const res = await request<{ data: { tender: Tender; myBidId?: string } }>(
    `/api/tenders/${tenderId}`,
    { headers: authed(token) }
  );
  return res.data;
}

/**
 * GET /api/tenders/:id/bids — the owner's comparison.
 *
 * Throws while the tender is still open: the server refuses to hand over
 * sealed bids, and the UI should surface that rather than pretend.
 */
export async function listTenderBids(
  token: string,
  tenderId: string
): Promise<{ bids: Bid[]; comparison: BidComparison }> {
  const res = await request<{ data: { bids: Bid[]; comparison: BidComparison } }>(
    `/api/tenders/${tenderId}/bids`,
    { headers: authed(token) }
  );
  return res.data;
}

/** What a contractor sends when pricing a tender. */
export interface BidInput {
  lines: { itemId: string; ratePerUnitBdt: number }[];
  timelineWeeks: number;
  validityDays: number;
  coverLetter?: string;
}

/** POST /api/tenders/:id/bids — submit or revise a sealed bid. */
export async function submitBid(token: string, tenderId: string, input: BidInput): Promise<Bid> {
  const res = await request<{ data: { bid: Bid } }>(`/api/tenders/${tenderId}/bids`, {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify(input),
  });
  return res.data.bid;
}

/** A contractor's own bid, with the tender it sits on. */
export interface MyBid extends Bid {
  tenderTitle: string;
  tenderStatus?: TenderStatus;
  tenderDeadlineAt?: string;
}

/** GET /api/bids/mine — the contractor's bid history. */
export async function listMyBids(token: string): Promise<MyBid[]> {
  const res = await request<{ data: { bids: MyBid[] } }>("/api/bids/mine", {
    headers: authed(token),
  });
  return res.data.bids;
}

async function bidAction(
  token: string,
  bidId: string,
  action: "withdraw" | "shortlist"
): Promise<Bid> {
  const res = await request<{ data: { bid: Bid } }>(`/api/bids/${bidId}/${action}`, {
    method: "POST",
    headers: authed(token),
  });
  return res.data.bid;
}

export const withdrawBid = (token: string, id: string) => bidAction(token, id, "withdraw");
export const shortlistBid = (token: string, id: string) => bidAction(token, id, "shortlist");

/** POST /api/bids/:id/award — pick the winner and start construction. */
export async function awardBid(
  token: string,
  bidId: string
): Promise<{ bid: Bid; buildContractId: string }> {
  const res = await request<{ data: { bid: Bid; buildContractId: string } }>(
    `/api/bids/${bidId}/award`,
    { method: "POST", headers: authed(token) }
  );
  return res.data;
}
