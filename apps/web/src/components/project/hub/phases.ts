import {
  BuildContractStatus,
  ContractStatus,
  DeliverableKind,
  DeliverableStatus,
  MilestoneStatus,
  PaymentKind,
  ProjectStatus,
  StructuralStatus,
  TenderStatus,
  UserRole,
  type BuildContract,
  type Contract,
  type EcpsApplication,
  type Milestone,
  type Project,
  type StructuralEngagement,
  type Tender,
} from "@buildora/shared";

/**
 * Where a project actually stands, computed from what has genuinely happened.
 *
 * The old progress bar read `project.status`, which the owner advances by hand
 * ("Start construction", "Mark completed") — so it could read "Under
 * construction" with no milestone funded and no contractor appointed. Everything
 * here is derived from real records instead: a payment exists, a deliverable was
 * approved, a tranche was released. The status badge stays as a label of the
 * stage; this is the honest measure of progress inside it.
 */

export type PhaseKey = "architect" | "engineer" | "rajuk" | "contractor";

/** One thing that either has or hasn't happened yet. */
export interface Gate {
  label: string;
  done: boolean;
  /**
   * Share of the phase this gate carries. Almost every gate is worth 1; the
   * construction milestones are worth their percentage of the contract sum, so
   * a 40%-of-value foundation moves the bar more than a 5% snag list.
   */
  weight: number;
}

export interface PhaseProgress {
  key: PhaseKey;
  gates: Gate[];
  /** 0–1 across this phase's own gates. */
  fraction: number;
  /** Share of the whole project this phase is worth. */
  weight: number;
  /** True once the phase can be worked on — see `blockedReason` when it isn't. */
  unlocked: boolean;
  /** Why it's locked, written for the owner: "Approve your design first". */
  blockedReason?: string;
  /** Something is waiting on the viewer right now. */
  needsYou: boolean;
}

/**
 * What each phase is worth of the whole build.
 *
 * Construction carries nearly half because it is nearly half the journey in
 * both time and money; the permit is short but nothing proceeds without it.
 */
const PHASE_WEIGHTS: Record<PhaseKey, number> = {
  architect: 25,
  engineer: 15,
  rajuk: 15,
  contractor: 45,
};

/** Everything the hub loads once and every phase reads from. */
export interface ProjectSnapshot {
  project: Project;
  contract: Contract | null;
  structural: StructuralEngagement | null;
  ecps: EcpsApplication | null;
  tender: Tender | null;
  build: BuildContract | null;
  milestones: Milestone[];
  /** Open proposals waiting on the owner while the brief is posted. */
  pendingProposals: number;
}

const gate = (label: string, done: boolean, weight = 1): Gate => ({ label, done, weight });

/** Weighted completion across a phase's gates; 0 when it has none. */
function fractionOf(gates: Gate[]): number {
  const total = gates.reduce((sum, g) => sum + g.weight, 0);
  if (total === 0) return 0;
  const done = gates.reduce((sum, g) => sum + (g.done ? g.weight : 0), 0);
  return done / total;
}

/**
 * Design: from posting the brief to an approved set of drawings.
 *
 * `isClient` decides whether "needs you" fires — a pending deliverable is the
 * owner's move to review, not the architect's.
 */
function architectPhase(snap: ProjectSnapshot, isClient: boolean): PhaseProgress {
  const { project, contract } = snap;
  const paid = (kind: PaymentKind) => (contract?.payments ?? []).some((p) => p.kind === kind);
  const approved = (kind: DeliverableKind) =>
    (contract?.deliverables ?? []).some(
      (d) => d.kind === kind && d.status === DeliverableStatus.APPROVED
    );

  const gates = [
    gate("Brief posted", project.status !== ProjectStatus.DRAFT),
    gate("Architect engaged", !!contract),
    gate("Concept fee paid", paid(PaymentKind.CONCEPT_FEE)),
    gate("Concept approved", approved(DeliverableKind.CONCEPT)),
    gate("Design escrow funded", paid(PaymentKind.ESCROW_DEPOSIT)),
    gate("Design approved", contract?.status === ContractStatus.COMPLETED),
  ];

  // Anything sitting in the owner's court: proposals to read, a submission to
  // review, or a fee the contract is waiting on.
  const awaitingReview = (contract?.deliverables ?? []).some(
    (d) => d.status === DeliverableStatus.PENDING_REVIEW
  );
  const awaitingPayment =
    contract?.status === ContractStatus.AWAITING_CONCEPT_FEE ||
    contract?.status === ContractStatus.AWAITING_ESCROW;

  return {
    key: "architect",
    gates,
    fraction: fractionOf(gates),
    weight: PHASE_WEIGHTS.architect,
    // The first phase is always open — it's where the journey starts.
    unlocked: true,
    needsYou: isClient && (snap.pendingProposals > 0 || awaitingReview || awaitingPayment),
  };
}

/** Structural: appointed, funded, drawings approved. Opens once design is approved. */
function engineerPhase(snap: ProjectSnapshot, isClient: boolean): PhaseProgress {
  const { project, contract, structural } = snap;
  const designApproved = contract?.status === ContractStatus.COMPLETED;

  const gates = [
    gate("Engineer appointed", !!structural || !!project.engineer),
    gate(
      "Structural escrow funded",
      !!structural && structural.status !== StructuralStatus.AWAITING_ESCROW
    ),
    gate("Drawings approved", structural?.status === StructuralStatus.COMPLETED),
  ];

  const awaitingReview = (structural?.submissions ?? []).some((s) => !s.decidedAt);

  return {
    key: "engineer",
    gates,
    fraction: fractionOf(gates),
    weight: PHASE_WEIGHTS.engineer,
    // An engineer works from an approved design, so there's nothing to do here
    // until the architect's contract completes.
    unlocked: designApproved || !!structural || !!project.engineer,
    blockedReason: "Opens once your architect's design is approved.",
    needsYou:
      isClient && (structural?.status === StructuralStatus.AWAITING_ESCROW || awaitingReview),
  };
}

/** RAJUK/ECPS: three coarse gates, since the step list is admin-configurable. */
function rajukPhase(snap: ProjectSnapshot, isClient: boolean): PhaseProgress {
  const { ecps, structural } = snap;
  const drawingsReady = structural?.status === StructuralStatus.COMPLETED;

  const gates = [
    gate("Application started", !!ecps),
    gate("Moved past the first step", (ecps?.currentStepOrder ?? 0) > 1),
    gate("Permit issued", ecps?.completed === true),
  ];

  return {
    key: "rajuk",
    gates,
    fraction: fractionOf(gates),
    weight: PHASE_WEIGHTS.rajuk,
    // Submitting without structural drawings is what gets an ECPS application
    // rejected, so the tab stays shut until they're approved — unless one was
    // already started, in which case hiding it would help nobody.
    unlocked: drawingsReady || !!ecps,
    blockedReason: "Opens once your structural drawings are approved.",
    needsYou: isClient && !!ecps && !ecps.completed,
  };
}

/**
 * Bidding and construction — the biggest phase, and the only one whose progress
 * is money-weighted: each milestone counts for its share of the contract sum.
 */
function contractorPhase(snap: ProjectSnapshot, isClient: boolean): PhaseProgress {
  const { contract, tender, build, milestones } = snap;
  const designApproved = contract?.status === ContractStatus.COMPLETED;

  // A cancelled tender earns no credit — it was called off, so bidding never
  // really happened and the bar must fall back when the owner cancels.
  const published =
    tender?.status === TenderStatus.OPEN ||
    tender?.status === TenderStatus.CLOSED ||
    tender?.status === TenderStatus.AWARDED;
  const closed =
    tender?.status === TenderStatus.CLOSED || tender?.status === TenderStatus.AWARDED || !!build;
  const awarded = tender?.status === TenderStatus.AWARDED || !!build;

  const gates: Gate[] = [
    gate("Tender published", published),
    gate("Bidding closed", closed),
    gate("Contractor awarded", awarded),
  ];

  // One gate per milestone, each worth its percentage of the contract sum, so
  // the bar tracks value delivered rather than items ticked off.
  for (const m of milestones) {
    gates.push(gate(m.title, m.status === MilestoneStatus.RELEASED, Math.max(m.amountPct, 1) / 10));
  }

  // The owner funds a tranche, and releases it once an engineer passes it.
  const toFund = milestones.some((m) => m.status === MilestoneStatus.PENDING);
  const toRelease = milestones.some((m) => m.status === MilestoneStatus.INSPECTION_PASSED);
  const bidsToCompare = tender?.status === TenderStatus.CLOSED && !awarded;

  return {
    key: "contractor",
    gates,
    fraction: fractionOf(gates),
    weight: PHASE_WEIGHTS.contractor,
    // Contractors bid against a permitted design; opening this earlier invites
    // bids that have to be re-priced.
    unlocked: designApproved || !!tender || !!build,
    blockedReason: "Opens once your architect's design is approved.",
    needsYou: isClient && (bidsToCompare || toFund || toRelease),
  };
}

export interface ProjectProgressResult {
  /** 0–100 across the whole build. */
  percent: number;
  phases: Record<PhaseKey, PhaseProgress>;
  /** The single most useful thing to do next, or null when nothing is pending. */
  nextUp: { phase: PhaseKey; label: string } | null;
}

/** Human name for each phase, used by the tab bar and the "next up" line. */
export const PHASE_LABELS: Record<PhaseKey, string> = {
  architect: "Architect",
  engineer: "Engineer",
  rajuk: "RAJUK approval",
  contractor: "Contractor",
};

/**
 * The whole picture in one call. `isClient` is the land owner's view — it's what
 * decides whether a pending item counts as "needs you", since the same page is
 * opened by the architect, engineer and contractor too.
 */
export function computeProjectProgress(
  snap: ProjectSnapshot,
  isClient: boolean
): ProjectProgressResult {
  const phases: Record<PhaseKey, PhaseProgress> = {
    architect: architectPhase(snap, isClient),
    engineer: engineerPhase(snap, isClient),
    rajuk: rajukPhase(snap, isClient),
    contractor: contractorPhase(snap, isClient),
  };

  const list = Object.values(phases);
  const totalWeight = list.reduce((sum, p) => sum + p.weight, 0);
  const earned = list.reduce((sum, p) => sum + p.weight * p.fraction, 0);

  // The first unfinished gate of the earliest unlocked, unfinished phase —
  // which is what an owner means when they ask "so what now?".
  let nextUp: ProjectProgressResult["nextUp"] = null;
  for (const phase of list) {
    if (!phase.unlocked || phase.fraction >= 1) continue;
    const pending = phase.gates.find((g) => !g.done);
    if (pending) {
      nextUp = { phase: phase.key, label: pending.label };
      break;
    }
  }

  return {
    percent: Math.round((earned / totalWeight) * 100),
    phases,
    nextUp,
  };
}

/**
 * Which tabs a role has any business in.
 *
 * These sets deliberately match what the API actually authorises, so no tab can
 * be opened only to answer 404. The three limits worth knowing:
 *
 *  - the document archive is owner/architect only (`canAccessArchive` in
 *    documents.controller), so neither the engineer nor the contractor has a
 *    Documents tab;
 *  - the site diary is owner/architect/engineer/contractor (`canAccessDiary`);
 *  - a contractor reaches this page only once they've won the tender, because
 *    that's when `canViewProject` starts letting them in. Before that they work
 *    from /tenders.
 *
 * The engineer does get the Contractor tab: they're the one who signs the
 * milestone inspections that release each tranche, and `canView` on the build
 * contract includes them.
 */
export function tabsForRole(
  role: UserRole,
  isOwner: boolean
): ("overview" | PhaseKey | "diary" | "documents")[] {
  if (isOwner) {
    return ["overview", "architect", "engineer", "rajuk", "contractor", "diary", "documents"];
  }
  switch (role) {
    case UserRole.ARCHITECT:
      return ["overview", "architect", "rajuk", "diary", "documents"];
    case UserRole.STRUCTURAL_ENGINEER:
      return ["overview", "engineer", "contractor", "diary"];
    case UserRole.CONTRACTOR:
      // The build they're running, and the site log they keep — nothing about
      // the design fees or the owner's document archive.
      return ["overview", "contractor", "diary"];
    default:
      return ["overview"];
  }
}
