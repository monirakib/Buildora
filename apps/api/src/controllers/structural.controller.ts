import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  ContractStatus,
  DEFAULT_COMMISSION_RATE,
  DeliverableStatus,
  NotificationType,
  PaymentKind,
  PaymentMethod,
  ProjectStatus,
  StructuralStatus,
  UserRole,
  VerificationStatus,
  type StructuralEngagement as StructuralDto,
  type StructuralSubmission,
  type UserRef,
} from "@buildora/shared";
import { Contract } from "../models/Contract";
import { Project } from "../models/Project";
import {
  LIVE_STRUCTURAL_STATUSES,
  StructuralEngagement,
  type StructuralEngagementDoc,
} from "../models/StructuralEngagement";
import { User } from "../models/User";
import { notify, preview } from "../services/notifications";

/**
 * Structural engineering engagements.
 *
 * The step the product plan puts between an approved design and a RAJUK
 * permit. The owner appoints a verified structural engineer, funds the fee into
 * escrow, and the engineer submits stamped drawings; the owner's approval
 * releases the money and pushes the project into PERMIT_STAGE.
 *
 * Two rules worth stating up front, because most of the guards below exist to
 * enforce them:
 *
 *   1. An engineer can only be appointed once the *design contract* is
 *      COMPLETED. Structural drawings are derived from an approved
 *      architectural design — appointing earlier means drawing structure for a
 *      layout that can still change.
 *   2. The owner is the only approver. The architect can read the drawings and
 *      leave a note (the structure has to work with their design), but they
 *      cannot approve or reject, so the flow has exactly one decision-maker and
 *      cannot deadlock.
 */

type PopulatedRef = {
  _id: unknown;
  name: string;
  username: string;
  profile?: { company?: string };
};

const withRefs = [
  { path: "project", select: "title architect" },
  { path: "client", select: "name username" },
  { path: "engineer", select: "name username profile.company" },
];

function toRef(ref: PopulatedRef): UserRef {
  return {
    id: String(ref._id),
    name: ref.name,
    username: ref.username,
    company: ref.profile?.company,
  };
}

function toSubmissionDto(sub: StructuralEngagementDoc["submissions"][number]): StructuralSubmission {
  return {
    title: sub.title,
    note: sub.note,
    fileUrl: sub.fileUrl,
    status: sub.status,
    signature: sub.signature,
    submittedAt: sub.submittedAt.toISOString(),
    clientNote: sub.clientNote,
    architectNote: sub.architectNote,
    decidedAt: sub.decidedAt?.toISOString(),
  };
}

/** Shapes an engagement for the client. `architect` is passed in separately. */
function toEngagementDto(
  doc: HydratedDocument<StructuralEngagementDoc>,
  architect?: UserRef
): StructuralDto {
  const project = doc.project as unknown as { _id: unknown; title: string };
  return {
    id: doc._id.toString(),
    project: { id: String(project._id), title: project.title },
    client: toRef(doc.client as unknown as PopulatedRef),
    engineer: toRef(doc.engineer as unknown as PopulatedRef),
    architect,
    status: doc.status,
    feeBdt: doc.feeBdt,
    commissionRate: doc.commissionRate,
    revisionsUsed: doc.revisionsUsed,
    maxRevisions: doc.maxRevisions,
    payments: doc.payments.map((p) => ({
      kind: p.kind,
      amountBdt: p.amountBdt,
      method: p.method,
      reference: p.reference,
      at: p.at.toISOString(),
    })),
    submissions: doc.submissions.map(toSubmissionDto),
    commissionBdt: doc.commissionBdt,
    releasedToEngineerBdt: doc.releasedToEngineerBdt,
    cancelReason: doc.cancelReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Loads the project's architect as a UserRef, for the DTO. */
async function architectRefOf(
  doc: HydratedDocument<StructuralEngagementDoc>
): Promise<UserRef | undefined> {
  const project = doc.project as unknown as { architect?: unknown };
  if (!project?.architect) return undefined;
  const user = await User.findById(project.architect).select("name username profile.company");
  return user ? toRef(user as unknown as PopulatedRef) : undefined;
}

/** Sends the engagement back, with the architect resolved. */
async function respond(res: Response, doc: HydratedDocument<StructuralEngagementDoc>, status = 200) {
  await doc.populate(withRefs);
  const architect = await architectRefOf(doc);
  return res.status(status).json({ data: { engagement: toEngagementDto(doc, architect) } });
}

/** The user ids on an engagement, whether the refs are populated or not. */
function idOf(value: unknown): string {
  return String((value as { _id?: unknown })?._id ?? value);
}

// ---------------------------------------------------------------------------
// Appointing an engineer
// ---------------------------------------------------------------------------

const appointSchema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  engineerId: z.string().min(1, "Choose an engineer"),
  feeBdt: z.coerce
    .number({ message: "Enter the agreed fee" })
    .positive("The fee must be more than zero")
    .max(100_000_000, "That fee looks too large"),
});

/** POST /api/structural — the owner appoints a structural engineer. */
export async function appointEngineer(req: Request, res: Response) {
  const parsed = appointSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { projectId, engineerId, feeBdt } = parsed.data;

  if (!isValidObjectId(projectId) || !isValidObjectId(engineerId)) {
    return res.status(400).json({ error: { message: "Invalid project or engineer id" } });
  }

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: { message: "Project not found" } });
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "That isn't your project" } });
  }

  // Rule 1: the design has to be finished and approved first.
  const contract = await Contract.findOne({ project: projectId });
  if (!contract || contract.status !== ContractStatus.COMPLETED) {
    return res.status(400).json({
      error: {
        message:
          "Finish and approve the architectural design before appointing a structural engineer",
      },
    });
  }

  const engineer = await User.findById(engineerId).select("name role verificationStatus");
  if (!engineer || engineer.role !== UserRole.STRUCTURAL_ENGINEER) {
    return res.status(404).json({ error: { message: "Structural engineer not found" } });
  }
  if (engineer.verificationStatus !== VerificationStatus.APPROVED) {
    return res
      .status(400)
      .json({ error: { message: "You can only appoint Platform Verified engineers" } });
  }

  let doc: HydratedDocument<StructuralEngagementDoc>;
  try {
    doc = await StructuralEngagement.create({
      project: projectId,
      client: req.auth!.sub,
      engineer: engineerId,
      feeBdt,
      commissionRate: DEFAULT_COMMISSION_RATE,
    });
  } catch (err) {
    // The unique partial index fired: this project already has a live engagement.
    if ((err as { code?: number }).code === 11000) {
      return res
        .status(409)
        .json({ error: { message: "This project already has a structural engineer engaged" } });
    }
    throw err;
  }

  // Attaching the engineer to the project is what puts it in their project
  // list and lets them read it — see canViewProject in projects.controller.
  project.engineer = doc.engineer;
  await project.save();

  await notify(engineerId, {
    type: NotificationType.CONTRACT,
    title: "You've been appointed as structural engineer",
    body: `${project.title} — agreed fee ৳${feeBdt.toLocaleString("en-BD")}. The owner funds escrow next.`,
    link: `/projects/${projectId}`,
    actorId: req.auth!.sub,
  });

  return respond(res, doc, 201);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Loads the engagement and checks the caller belongs to it. `allowArchitect`
 * covers the read/comment paths the project's architect may use.
 */
async function loadEngagement(
  req: Request,
  res: Response,
  opts: { allowArchitect?: boolean } = {}
): Promise<{
  doc: HydratedDocument<StructuralEngagementDoc>;
  party: "CLIENT" | "ENGINEER" | "ARCHITECT";
} | null> {
  const id = req.params.id;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Engagement not found" } });
    return null;
  }
  const doc = await StructuralEngagement.findById(id).populate(withRefs);
  if (!doc) {
    res.status(404).json({ error: { message: "Engagement not found" } });
    return null;
  }

  const me = req.auth!.sub;
  if (idOf(doc.client) === me) return { doc, party: "CLIENT" };
  if (idOf(doc.engineer) === me) return { doc, party: "ENGINEER" };

  const project = doc.project as unknown as { architect?: unknown };
  if (opts.allowArchitect && project?.architect && idOf(project.architect) === me) {
    return { doc, party: "ARCHITECT" };
  }

  res.status(403).json({ error: { message: "That isn't your engagement" } });
  return null;
}

/** GET /api/structural/project/:id — the engagement on one project, if any. */
export async function getForProject(req: Request, res: Response) {
  const id = req.params.id;
  if (typeof id !== "string" || !isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const project = await Project.findById(id);
  if (!project) return res.status(404).json({ error: { message: "Project not found" } });

  const me = req.auth!.sub;
  const onProject =
    String(project.owner) === me ||
    (project.architect && String(project.architect) === me) ||
    (project.engineer && String(project.engineer) === me) ||
    req.auth!.role === UserRole.ADMIN;
  if (!onProject) {
    return res.status(403).json({ error: { message: "That isn't your project" } });
  }

  // Newest first: a cancelled engagement can be followed by a replacement.
  const doc = await StructuralEngagement.findOne({ project: id })
    .sort({ createdAt: -1 })
    .populate(withRefs);
  if (!doc) return res.json({ data: { engagement: null } });

  const architect = await architectRefOf(doc);
  return res.json({ data: { engagement: toEngagementDto(doc, architect) } });
}

/** GET /api/structural/mine — engagements the signed-in user is part of. */
export async function listMyEngagements(req: Request, res: Response) {
  const me = req.auth!.sub;
  const docs = await StructuralEngagement.find({ $or: [{ client: me }, { engineer: me }] })
    .sort({ createdAt: -1 })
    .populate(withRefs);

  const engagements = await Promise.all(
    docs.map(async (doc) => toEngagementDto(doc, await architectRefOf(doc)))
  );
  return res.json({ data: { engagements } });
}

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------

const escrowSchema = z.object({
  method: z.enum(PaymentMethod, { message: "Choose a payment method" }),
  reference: z.string().trim().max(120).optional(),
});

/**
 * POST /api/structural/:id/escrow — the owner funds the fee.
 *
 * Simulated, like every payment in this project: there are no gateway keys, so
 * the entry is written straight to the ledger with whatever reference the payer
 * typed. Real bKash/Nagad integration would replace this one function.
 */
export async function fundEscrow(req: Request, res: Response) {
  const loaded = await loadEngagement(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (party !== "CLIENT") {
    return res.status(403).json({ error: { message: "Only the owner can fund the escrow" } });
  }
  if (doc.status !== StructuralStatus.AWAITING_ESCROW) {
    return res.status(400).json({ error: { message: "This engagement is already funded" } });
  }

  const parsed = escrowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  doc.payments.push({
    kind: PaymentKind.ESCROW_DEPOSIT,
    amountBdt: doc.feeBdt,
    method: parsed.data.method,
    reference: parsed.data.reference,
    at: new Date(),
  });
  doc.status = StructuralStatus.DRAWINGS_IN_PROGRESS;
  await doc.save();

  await notify(idOf(doc.engineer), {
    type: NotificationType.PAYMENT,
    title: "Structural fee is in escrow",
    body: `৳${doc.feeBdt.toLocaleString("en-BD")} is held. You can start submitting drawings.`,
    link: `/projects/${idOf(doc.project)}`,
    actorId: req.auth!.sub,
  });

  return respond(res, doc);
}

// ---------------------------------------------------------------------------
// Submitting drawings
// ---------------------------------------------------------------------------

const submitSchema = z.object({
  title: z.string().trim().min(3, "Give the drawing set a title").max(160),
  note: z.string().trim().max(1000).optional(),
  fileUrl: z.string().trim().min(1, "Attach the drawings"),
  // The engineer's stamp. Required, because an unsigned structural drawing is
  // not something an owner should be asked to approve.
  signature: z.string().trim().min(2, "Type your name to certify this set").max(120),
});

/** POST /api/structural/:id/submissions — the engineer submits a drawing set. */
export async function submitDrawings(req: Request, res: Response) {
  const loaded = await loadEngagement(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (party !== "ENGINEER") {
    return res.status(403).json({ error: { message: "Only the engineer can submit drawings" } });
  }
  if (doc.status !== StructuralStatus.DRAWINGS_IN_PROGRESS) {
    return res.status(400).json({
      error: {
        message:
          doc.status === StructuralStatus.AWAITING_ESCROW
            ? "Wait for the owner to fund the escrow first"
            : "This engagement is closed",
      },
    });
  }
  // One open submission at a time — otherwise "which set am I approving?"
  if (doc.submissions.some((s) => s.status === DeliverableStatus.PENDING_REVIEW)) {
    return res
      .status(400)
      .json({ error: { message: "A drawing set is already waiting for the owner's review" } });
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  doc.submissions.push({
    ...parsed.data,
    status: DeliverableStatus.PENDING_REVIEW,
    submittedAt: new Date(),
  });
  await doc.save();

  await notify(idOf(doc.client), {
    type: NotificationType.CONTRACT,
    title: "Structural drawings submitted",
    body: preview(parsed.data.title, 100),
    link: `/projects/${idOf(doc.project)}`,
    actorId: req.auth!.sub,
  });

  return respond(res, doc);
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const reviewSchema = z.object({
  action: z.enum(["approve", "request-changes"], { message: "Invalid decision" }),
  note: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/structural/:id/review — the owner approves or sends back.
 *
 * Approval is terminal: it releases the escrow (minus commission) and moves the
 * project on to the permit stage, which is what the ECPS tracker needs.
 */
export async function reviewDrawings(req: Request, res: Response) {
  const loaded = await loadEngagement(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (party !== "CLIENT") {
    return res.status(403).json({ error: { message: "Only the owner can review the drawings" } });
  }

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { action, note } = parsed.data;

  const pending = doc.submissions.find((s) => s.status === DeliverableStatus.PENDING_REVIEW);
  if (!pending) {
    return res.status(400).json({ error: { message: "There's nothing waiting for review" } });
  }

  pending.clientNote = note;
  pending.decidedAt = new Date();

  if (action === "request-changes") {
    if (doc.revisionsUsed >= doc.maxRevisions) {
      return res.status(400).json({
        error: { message: `All ${doc.maxRevisions} revision rounds have been used` },
      });
    }
    pending.status = DeliverableStatus.CHANGES_REQUESTED;
    doc.revisionsUsed += 1;
    await doc.save();

    await notify(idOf(doc.engineer), {
      type: NotificationType.CONTRACT,
      title: "Changes requested on your drawings",
      body: note
        ? preview(note, 120)
        : `Revision ${doc.revisionsUsed} of ${doc.maxRevisions}.`,
      link: `/projects/${idOf(doc.project)}`,
      actorId: req.auth!.sub,
    });

    return respond(res, doc);
  }

  // Approved — settle the money and move the project along.
  pending.status = DeliverableStatus.APPROVED;
  const commission = Math.round(doc.feeBdt * doc.commissionRate);
  const released = doc.feeBdt - commission;
  doc.commissionBdt = commission;
  doc.releasedToEngineerBdt = released;
  doc.payments.push({
    kind: PaymentKind.ESCROW_RELEASE,
    amountBdt: released,
    at: new Date(),
  });
  doc.status = StructuralStatus.COMPLETED;
  await doc.save();

  // Structural drawings signed off is exactly what a RAJUK submission needs, so
  // the project moves to the permit stage — unless it's already past it.
  const project = await Project.findById(idOf(doc.project));
  if (project && project.status === ProjectStatus.DESIGN_IN_PROGRESS) {
    project.status = ProjectStatus.PERMIT_STAGE;
    await project.save();
  }

  await notify(idOf(doc.engineer), {
    type: NotificationType.PAYMENT,
    title: "Structural drawings approved",
    body: `৳${released.toLocaleString("en-BD")} released from escrow (after ${Math.round(doc.commissionRate * 100)}% platform commission).`,
    link: `/projects/${idOf(doc.project)}`,
    actorId: req.auth!.sub,
  });

  return respond(res, doc);
}

/**
 * POST /api/structural/:id/comment — the project's architect leaves a note.
 *
 * Deliberately not an approval. The architect needs to say "this column grid
 * clashes with my layout", but the owner is the one paying and the one who
 * decides, so this only ever annotates the open submission.
 */
export async function commentOnDrawings(req: Request, res: Response) {
  const loaded = await loadEngagement(req, res, { allowArchitect: true });
  if (!loaded) return;
  const { doc, party } = loaded;

  if (party !== "ARCHITECT") {
    return res
      .status(403)
      .json({ error: { message: "Only the project's architect can comment here" } });
  }

  const parsed = z
    .object({ note: z.string().trim().min(2, "Write a note").max(1000) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  const pending = doc.submissions.find((s) => s.status === DeliverableStatus.PENDING_REVIEW);
  if (!pending) {
    return res.status(400).json({ error: { message: "There's no open drawing set to comment on" } });
  }

  pending.architectNote = parsed.data.note;
  await doc.save();

  // Both the owner (who decides) and the engineer (who'd act on it) want this.
  for (const recipient of [idOf(doc.client), idOf(doc.engineer)]) {
    await notify(recipient, {
      type: NotificationType.CONTRACT,
      title: "The architect commented on the structural drawings",
      body: preview(parsed.data.note, 120),
      link: `/projects/${idOf(doc.project)}`,
      actorId: req.auth!.sub,
    });
  }

  return respond(res, doc);
}

/** POST /api/structural/:id/cancel — either side calls the engagement off. */
export async function cancelEngagement(req: Request, res: Response) {
  const loaded = await loadEngagement(req, res);
  if (!loaded) return;
  const { doc, party } = loaded;

  if (!LIVE_STRUCTURAL_STATUSES.includes(doc.status)) {
    return res.status(400).json({ error: { message: "This engagement is already closed" } });
  }

  const parsed = z
    .object({ reason: z.string().trim().max(500).optional() })
    .safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;

  // Anything already in escrow goes back to the owner. Nothing has been
  // released at this point — release only happens on approval, which ends the
  // engagement — so refunding the deposit in full is always correct here.
  const deposited = doc.payments
    .filter((p) => p.kind === PaymentKind.ESCROW_DEPOSIT)
    .reduce((sum, p) => sum + p.amountBdt, 0);
  if (deposited > 0) {
    doc.payments.push({ kind: PaymentKind.REFUND, amountBdt: deposited, at: new Date() });
  }

  doc.status = StructuralStatus.CANCELLED;
  doc.cancelReason = reason;
  await doc.save();

  // Detach from the project so the owner can appoint someone else.
  await Project.findByIdAndUpdate(idOf(doc.project), { $unset: { engineer: 1 } });

  const otherId = party === "CLIENT" ? idOf(doc.engineer) : idOf(doc.client);
  await notify(otherId, {
    type: NotificationType.CONTRACT,
    title: "Structural engagement cancelled",
    body: reason
      ? preview(reason, 120)
      : deposited > 0
        ? `৳${deposited.toLocaleString("en-BD")} refunded from escrow.`
        : "No money had been deposited.",
    link: `/projects/${idOf(doc.project)}`,
    actorId: req.auth!.sub,
  });

  return respond(res, doc);
}
