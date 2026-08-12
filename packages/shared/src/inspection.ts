import type { InspectionVerdict, MilestoneStatus } from "./enums";
import type { UserRef } from "./types";

/**
 * Milestones and inspections — how construction money is released.
 *
 * This is the promise the product plan makes about the build stage: escrow does
 * not open because a contractor says the work is done, it opens because a
 * structural engineer inspected it and signed. The chain is deliberately
 * one-way:
 *
 *   PENDING → owner funds → FUNDED → contractor claims done →
 *   AWAITING_INSPECTION → engineer inspects → PASSED or FAILED →
 *   owner releases → RELEASED
 *
 * A failed inspection sends it back to FUNDED, so the contractor fixes the
 * defects and calls the engineer again. Nothing skips the engineer, and the
 * owner still holds the final release — the engineer certifies the work, they
 * don't spend the owner's money.
 */

/** One construction stage the contract pays out against. */
export interface Milestone {
  id: string;
  buildContractId: string;
  projectId: string;
  /** 1-based position in the schedule; the order work happens in. */
  order: number;
  title: string;
  description?: string;
  /** Share of the contract sum this stage is worth, as a percentage. */
  amountPct: number;
  /** The BDT that share works out to, frozen when the schedule was created. */
  amountBdt: number;
  targetDate?: string;
  status: MilestoneStatus;
  /** Set when the contractor claims the work is finished. */
  claimedAt?: string;
  releasedAt?: string;
  /** Net of commission — what the contractor actually received. */
  releasedAmountBdt?: number;
  /** Every inspection this milestone has had, newest last. */
  inspections: Inspection[];
  createdAt: string;
  updatedAt: string;
}

/** One checklist line an engineer ticks during an inspection. */
export interface ChecklistResult {
  label: string;
  passed: boolean;
  note?: string;
}

/**
 * Where the inspector was when they filed. Captured from the browser and
 * reverse-geocoded, as evidence the inspection happened on site rather than
 * from an office — which is the whole reason a signature is worth anything.
 */
export interface InspectionLocation {
  lat: number;
  lng: number;
  address?: string;
  /** Metres between the inspector and the project's plot pin, when known. */
  distanceFromPlotM?: number;
}

/** One engineer's inspection of one milestone. */
export interface Inspection {
  id: string;
  milestoneId: string;
  inspector: UserRef;
  /** Name of the checklist template used, copied in at the time. */
  templateName: string;
  results: ChecklistResult[];
  verdict: InspectionVerdict;
  notes?: string;
  photoUrls: string[];
  /** The engineer's typed certification, same idea as a drawing stamp. */
  signature: string;
  location?: InspectionLocation;
  inspectedAt: string;
}

/**
 * An admin-editable checklist. Kept in the database rather than hardcoded for
 * the same reason DAP zones and RAJUK fees are: the items a foundation
 * inspection must cover are a rule that changes without a redeploy.
 */
export interface InspectionTemplate {
  id: string;
  name: string;
  description?: string;
  items: string[];
  active: boolean;
}

/** Percentage split a fresh milestone schedule starts from. */
export interface MilestoneTemplate {
  title: string;
  description: string;
  amountPct: number;
}

/**
 * The default construction schedule offered when a contract is awarded, as a
 * starting point the owner and contractor can edit. Percentages sum to 100.
 * The shape follows how a small building actually gets built in Bangladesh —
 * substructure first, then frame by floor, then finishes.
 */
export const DEFAULT_MILESTONE_TEMPLATE: MilestoneTemplate[] = [
  {
    title: "Mobilisation & site setup",
    description: "Site cleared, boundary secured, labour shed and utilities in place.",
    amountPct: 10,
  },
  {
    title: "Foundation & substructure",
    description: "Excavation, piling where required, footing and grade beam cast.",
    amountPct: 20,
  },
  {
    title: "Superstructure frame",
    description: "Columns, beams and slabs cast to roof level.",
    amountPct: 25,
  },
  {
    title: "Masonry & plastering",
    description: "Brickwork, internal and external plaster complete.",
    amountPct: 15,
  },
  {
    title: "Services rough-in",
    description: "Electrical conduits, plumbing lines and sanitary rough-in.",
    amountPct: 12,
  },
  {
    title: "Finishes",
    description: "Tiling, painting, doors, windows and fixtures.",
    amountPct: 13,
  },
  {
    title: "Handover",
    description: "Snag list cleared, cleaning done, keys and documents handed over.",
    amountPct: 5,
  },
];

/** A fallback checklist, seeded into the database on first run. */
export const DEFAULT_INSPECTION_ITEMS = [
  "Work matches the approved structural drawings",
  "Concrete grade and cover meet specification",
  "Reinforcement size, spacing and lapping as detailed",
  "Formwork removed without damage or honeycombing",
  "Levels, alignment and plumb within tolerance",
  "Curing carried out for the required duration",
  "Site safety measures in place",
  "No visible defects outstanding from the previous stage",
];
