import { EstimateTier } from "./enums";
import type { PricingProvenance } from "./pricing";
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
  /** Which rung of the accuracy ladder produced this. */
  tier: EstimateTier;
  /** Where the floor area came from, in words, e.g. "your drawn floor plans". */
  areaSource: string;
  /**
   * The range this estimate should actually be read as. A plot-only guess is
   * ±30%; a bid-backed figure is ±5%. Always show the range, never the midpoint
   * alone — a single number reads as a quote, and this is not one.
   */
  rangeLowBdt: number;
  rangeHighBdt: number;
  /** How live marketplace prices have moved since the previous estimate. */
  drift?: MarketDrift;
  /**
   * Which live prices this figure was actually built from.
   *
   * Present only on the PLOT_ONLY and FLOOR_PLAN tiers. The BOQ and bid-backed
   * tiers are priced from real numbers for this specific building, and are
   * deliberately not adjusted by a general market index — see
   * services/estimateLadder.applyLivePrices.
   */
  pricing?: PricingProvenance;
}

/**
 * How far each tier should be trusted, as a fraction either side of the total.
 *
 * Methodology rather than pricing, so it lives in code — unlike the rates
 * themselves, which are admin-editable in the database because they move with
 * the market.
 */
export const ESTIMATE_CONFIDENCE: Record<EstimateTier, number> = {
  [EstimateTier.PLOT_ONLY]: 0.3,
  [EstimateTier.FLOOR_PLAN]: 0.15,
  [EstimateTier.BOQ]: 0.1,
  [EstimateTier.BID_BACKED]: 0.05,
};

/** Plain-language labels for the tier badge. */
export const ESTIMATE_TIER_LABELS: Record<EstimateTier, string> = {
  [EstimateTier.PLOT_ONLY]: "Rough guess",
  [EstimateTier.FLOOR_PLAN]: "From your floor plans",
  [EstimateTier.BOQ]: "From your Bill of Quantities",
  [EstimateTier.BID_BACKED]: "From real contractor bids",
};

/* ---------- Market drift ---------- */

/**
 * How one material category's real listing prices have moved.
 *
 * Read from actual supplier listings on the marketplace, compared against the
 * median stored on the previous estimate. It is reported, never applied: see
 * MarketDrift below for why nobody should multiply a rate by this.
 */
export interface CategoryDrift {
  category: string;
  /** Median listing price now, in BDT. */
  medianBdt: number;
  /** Median when the previous estimate was taken, or null if there wasn't one. */
  previousMedianBdt: number | null;
  changePct: number | null;
  /** How many active listings the median came from. */
  listings: number;
}

/**
 * The market signal shown beside an estimate.
 *
 * **This never changes the estimate's total, and that is deliberate.**
 * Marketplace prices are per-unit *material* prices — a bag of cement. BoqRate
 * lines are composite: "RCC works (1:1.5:3) including shuttering" is material
 * plus labour plus formwork. Dividing one by the other produces a number that
 * looks authoritative and means nothing. So drift is reported as a signal for a
 * human to weigh, and the total stays derived from the rate table alone.
 */
export interface MarketDrift {
  categories: CategoryDrift[];
  /** Categories skipped for having too few listings to read anything into. */
  thinCategories: string[];
  comparedTo: string | null;
}

/* ---------- Estimate snapshots ---------- */

/** One stored estimate, so the owner can watch the figure tighten over time. */
export interface EstimateSnapshot {
  id: string;
  tier: EstimateTier;
  areaSqft: number;
  totalBdt: number;
  perSqftBdt: number;
  rangeLowBdt: number;
  rangeHighBdt: number;
  createdAt: string;
}
