import type { DeliverableStatus, StructuralStatus } from "./enums";
import type { PaymentEntry, UserRef } from "./types";

/**
 * Structural engineering — the step between an approved architectural design
 * and a RAJUK permit application.
 *
 * The land owner appoints a verified structural engineer, funds the fee into
 * escrow, and the engineer submits stamped structural drawings. The owner
 * approves (or sends back for changes, up to the same three rounds the design
 * contract allows); approval releases the escrow and moves the project to the
 * permit stage. The assigned architect can read the drawings and leave notes —
 * the structure has to work with their design — but the owner holds the
 * decision, so there is only ever one approver and nothing can deadlock.
 */

/** One submitted drawing set awaiting (or past) the owner's review. */
export interface StructuralSubmission {
  title: string;
  note?: string;
  fileUrl: string;
  status: DeliverableStatus;
  /**
   * The engineer's certification, typed when they submit. A structural
   * engineer stamps their own drawings in practice, so this is captured at
   * submission rather than as a separate approval step afterwards.
   */
  signature: string;
  submittedAt: string;
  /** The owner's note when they approved or asked for changes. */
  clientNote?: string;
  /** The assigned architect's comment, if they left one. */
  architectNote?: string;
  decidedAt?: string;
}

/** A land owner's engagement of a structural engineer on one project. */
export interface StructuralEngagement {
  id: string;
  project: { id: string; title: string };
  client: UserRef;
  engineer: UserRef;
  /** The project's architect, who may comment on submissions. */
  architect?: UserRef;
  status: StructuralStatus;
  feeBdt: number;
  /** Platform commission taken from the escrow on release. */
  commissionRate: number;
  revisionsUsed: number;
  maxRevisions: number;
  payments: PaymentEntry[];
  submissions: StructuralSubmission[];
  /** Filled in when the owner approves and the escrow is released. */
  commissionBdt?: number;
  releasedToEngineerBdt?: number;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}
