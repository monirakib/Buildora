import { DisputeStatus } from "./enums";
import type { ChangeOrderStatus, DisputeResolution, DisputeScope } from "./enums";
import type { UserRef } from "./types";

/**
 * The three things that happen when a build stops going to plan: the two sides
 * disagree, the scope changes, or the job finishes and has to be handed over.
 */

/* ---------- Disputes ---------- */

/** A photo or document attached as evidence. */
export interface DisputeEvidence {
  /** What it shows, e.g. "Crack in column C3". */
  caption: string;
  fileUrl: string;
  uploadedBy: string;
  at: string;
}

export interface Dispute {
  id: string;
  projectId: string;
  projectTitle: string;
  scope: DisputeScope;
  /** The contract, engagement or milestone this is about. */
  targetId: string;
  /** Human label for the target, e.g. "Milestone 3 — Roof casting". */
  targetLabel: string;
  raisedBy: UserRef;
  /** The other side of the disagreement. */
  against: UserRef;
  reason: string;
  /** What the raiser says is at stake. Never moves money on its own. */
  amountClaimedBdt?: number;
  evidence: DisputeEvidence[];
  status: DisputeStatus;
  /** Set once a supervisor decides. */
  resolution?: DisputeResolution;
  resolutionNote?: string;
  /** How much went back to the client, when the decision moved money. */
  refundBdt?: number;
  /** How much went to the professional. */
  releasedBdt?: number;
  resolvedBy?: UserRef;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Statuses where the dispute is still live. While one of these is open on a
 * contract, the money it concerns is frozen: no release, no approval, no
 * cancellation that would move the disputed amount out from under a supervisor.
 */
export const LIVE_DISPUTE_STATUSES: readonly DisputeStatus[] = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
];

export function isDisputeLive(status: DisputeStatus): boolean {
  return LIVE_DISPUTE_STATUSES.includes(status);
}

/* ---------- Change orders ---------- */

export interface ChangeOrder {
  id: string;
  projectId: string;
  buildContractId: string;
  raisedBy: UserRef;
  title: string;
  /** Why the work is needed, and what it covers. */
  description: string;
  /**
   * Change to the contract sum in BDT. Negative for work removed — a variation
   * is not always more money, and pretending otherwise would make the figure
   * useless for anything but upselling.
   */
  amountDeltaBdt: number;
  /** Extra (or saved) weeks on the programme. */
  timelineDeltaWeeks: number;
  status: ChangeOrderStatus;
  /** The owner's note when approving or rejecting. */
  decisionNote?: string;
  decidedAt?: string;
  /** The milestone created for this variation, once approved and chargeable. */
  milestoneId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Handover ---------- */

/** One warranty handed to the owner at completion. */
export interface WarrantyEntry {
  /** What it covers, e.g. "Waterproofing — roof and basement". */
  item: string;
  /** Who honours it, e.g. "Rahman Builders" or "Berger Paints". */
  provider: string;
  /** Length of cover in months, from `startsAt`. */
  months: number;
  /** ISO date the cover begins — normally the handover date. */
  startsAt: string;
  /** Computed from startsAt + months, stored so it survives a rule change. */
  expiresAt: string;
  documentUrl?: string;
}

/**
 * The handover package: what turns "the builder left" into a documented end.
 *
 * Until this existed, ProjectStatus.COMPLETED meant only that somebody clicked
 * a button. This is the evidence behind it — the occupancy certificate, the
 * as-built drawings, and every warranty with a date it runs out.
 */
export interface Handover {
  id: string;
  projectId: string;
  /** RAJUK occupancy certificate — the legal permission to use the building. */
  occupancyCertificateUrl?: string;
  occupancyCertificateNo?: string;
  /** When the keys actually changed hands. */
  handedOverAt?: string;
  notes?: string;
  warranties: WarrantyEntry[];
  /** True once the owner confirms they've received everything. */
  acceptedByOwner: boolean;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Adds `months` to an ISO date and returns the ISO date it lands on. */
export function warrantyExpiry(startsAt: string, months: number): string {
  const start = new Date(`${startsAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return startsAt;
  // setUTCMonth handles the year rollover, and clamps a 31st into a short month.
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end.toISOString().slice(0, 10);
}

/** Whether a warranty has run out, as of `now`. */
export function isWarrantyExpired(entry: WarrantyEntry, now = new Date()): boolean {
  const end = new Date(`${entry.expiresAt.slice(0, 10)}T23:59:59Z`);
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
}

/* ---------- Public progress link ---------- */

/**
 * What a shared link exposes.
 *
 * Deliberately thin. The link has no login behind it, so this carries only what
 * a relative or investor legitimately wants — which stage the build is at and
 * how far it has got — and none of what they don't need: no money, no contracts,
 * no professional names, no street address, no documents.
 */
export interface PublicProgress {
  title: string;
  /** Locality only, never the street address. */
  areaName: string;
  buildingType: string;
  floors: number;
  status: string;
  designApproved: boolean;
  structuralApproved: boolean;
  permitIssued: boolean;
  constructionStarted: boolean;
  /** 0–100, weighted by each milestone's share of the contract sum. */
  constructionPercent: number;
  milestones: { order: number; title: string; done: boolean }[];
  handedOver: boolean;
  handedOverAt?: string;
  updatedAt: string;
}
