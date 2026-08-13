import type { BidStatus, BuildContractStatus, TenderStatus } from "./enums";
import type { PaymentEntry, UserRef } from "./types";

/**
 * Contractor bidding — the step between an approved design with permits and
 * anyone breaking ground.
 *
 * The owner publishes a Bill of Quantities: a list of work items with
 * quantities but **no rates**. Contractors price each line and submit a sealed
 * bid. Nobody — not the other contractors, not the owner — can read a bid
 * until bidding closes, which is what makes the comparison worth anything.
 * The owner then compares line by line, shortlists, and awards one, which
 * creates the build contract that construction runs on.
 *
 * The BOQ is quantities-only on purpose: publishing rates would anchor every
 * bid to the owner's guess and defeat the point of tendering.
 */

/** One line of the Bill of Quantities — what to build, and how much of it. */
export interface TenderItem {
  /** Stable within a tender, so a bid line can point at it. */
  id: string;
  description: string;
  /** "cft", "sft", "kg", "bags", "nos" — whatever the trade quotes in. */
  unit: string;
  quantity: number;
  /**
   * What the platform reckons this should cost per unit, from the
   * admin-editable rate table. Shown to the owner while drafting so they can
   * sanity-check a bid, and **never sent to contractors**.
   */
  guideRateBdt?: number;
}

/** A published (or draft) request for construction bids on one project. */
export interface Tender {
  id: string;
  projectId: string;
  projectTitle: string;
  owner: UserRef;
  title: string;
  scope: string;
  items: TenderItem[];
  /** Bids submitted after this instant are refused. */
  deadlineAt: string;
  /** Optional open day for contractors to walk the plot before pricing. */
  siteVisitAt?: string;
  status: TenderStatus;
  /** Owner's own estimate from the guide rates — never exposed to bidders. */
  estimatedBdt?: number;
  /** How many bids are in. Visible to the owner as a count while sealed. */
  bidCount: number;
  /** Present only once the tender is awarded. */
  awardedBidId?: string;
  createdAt: string;
  updatedAt: string;
}

/** One contractor's price for one BOQ line. */
export interface BidLine {
  /** Matches a `TenderItem.id`. */
  itemId: string;
  ratePerUnitBdt: number;
  /** rate × the tender's quantity, computed server-side. */
  amountBdt: number;
}

/** A contractor's sealed offer on a tender. */
export interface Bid {
  id: string;
  tenderId: string;
  contractor: UserRef;
  /** Denormalised so the comparison table can show a rating without a join. */
  contractorRating?: { avg: number; count: number };
  lines: BidLine[];
  /** Sum of the lines, computed server-side — never trusted from the client. */
  totalBdt: number;
  /** How long the contractor says the build will take. */
  timelineWeeks: number;
  /** How long the price stands. */
  validityDays: number;
  coverLetter?: string;
  status: BidStatus;
  submittedAt: string;
  updatedAt: string;
}

/** One row of the owner's side-by-side comparison. */
export interface BidComparisonRow {
  itemId: string;
  description: string;
  unit: string;
  quantity: number;
  guideRateBdt?: number;
  /** Median rate across all submitted bids, for spotting an outlier. */
  medianRateBdt?: number;
  /** Keyed by bid id. */
  rates: Record<string, number>;
}

/** Everything the comparison view needs, in one payload. */
export interface BidComparison {
  rows: BidComparisonRow[];
  /** Bid totals keyed by bid id, so the footer can show them aligned. */
  totals: Record<string, number>;
  lowestBidId?: string;
}

/**
 * The construction contract created when a bid is awarded.
 *
 * Money moves per milestone rather than in one escrow: see `Milestone`. The
 * contract itself only carries the agreed sum, the commission rate, and the
 * ledger of everything that has actually moved.
 */
export interface BuildContract {
  id: string;
  projectId: string;
  projectTitle: string;
  tenderId: string;
  bidId: string;
  client: UserRef;
  contractor: UserRef;
  /** The engineer who signs off milestones, copied from the project. */
  engineer?: UserRef;
  status: BuildContractStatus;
  contractSumBdt: number;
  timelineWeeks: number;
  commissionRate: number;
  payments: PaymentEntry[];
  /** Sum of every released tranche, net of commission. */
  releasedToContractorBdt: number;
  commissionBdt: number;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Cost estimate ---------- */

/** One priced line of an estimate, straight from the BOQ rate table. */
export interface CostLine {
  description: string;
  category: string;
  unit: string;
  quantity: number;
  ratePerUnitBdt: number;
  totalBdt: number;
}

/**
 * A build's estimated cost.
 *
 * The arithmetic is done from the admin-maintained BoqRate table, not by a
 * language model — an owner budgeting a building deserves better than numbers
 * that merely look right, and it means this estimate agrees with the BOQ a
 * contractor later bids against. `narrative` is the only part written by
 * Gemini, and it is absent when no key is configured.
 */
export interface CostEstimate {
  areaSqft: number;
  floors: number;
  buildingType: string;
  lines: CostLine[];
  byCategory: { category: string; totalBdt: number }[];
  totalBdt: number;
  perSqftBdt: number;
  /** Written explanation, when the AI key is set. The figures never depend on it. */
  narrative?: string;
  /** How many rate rows fed the estimate — zero means the table is unseeded. */
  ratesFrom: number;
  estimatedAt: string;
}
