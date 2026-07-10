import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  ContractStatus,
  DeliverableKind,
  DeliverableStatus,
  PaymentKind,
  PaymentMethod,
  ProjectStatus,
  ProposalStatus,
  UserRole,
  type Contract as ContractDto,
} from "@buildora/shared";
import { Contract, type ContractDoc } from "../models/Contract";
import { Project } from "../models/Project";
import { Proposal } from "../models/Proposal";
import { findProjectOr404 } from "./projects.controller";

// Sandbox payment form: the payer picks a channel and types the transaction
// reference they "paid" with. A real bKash/Nagad integration would replace this.
const paymentSchema = z.object({
  method: z.enum(PaymentMethod, { message: "Choose a payment method" }),
  reference: z.string().trim().min(4, "Enter the transaction reference (e.g. bKash TrxID)").max(60),
});

const deliverableSchema = z.object({
  title: z.string().trim().min(3, "Give the submission a title").max(160),
  note: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(1000).optional()
  ),
  fileUrl: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.url("Enter a valid file link").optional()
  ),
});

const decisionSchema = z.object({
  action: z.enum(["approve", "request-changes"], { message: "Invalid decision" }),
  note: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(1000).optional()
  ),
});

type PopulatedRef = {
  _id: unknown;
  name: string;
  username: string;
  profile?: { company?: string };
};
type ProjectRef = { _id: unknown; title: string };

const withRefs = [
  { path: "project", select: "title" },
  { path: "client", select: "name username" },
  { path: "architect", select: "name username profile.company" },
];

/** Shapes a contract (project + both parties populated) for the client. */
function toContractDto(doc: HydratedDocument<ContractDoc>): ContractDto {
  const project = doc.project as unknown as ProjectRef;
  const client = doc.client as unknown as PopulatedRef;
  const architect = doc.architect as unknown as PopulatedRef;
  return {
    id: doc._id.toString(),
    project: { id: String(project._id), title: project.title },
    client: { id: String(client._id), name: client.name, username: client.username },
    architect: {
      id: String(architect._id),
      name: architect.name,
      username: architect.username,
      company: architect.profile?.company,
    },
    status: doc.status,
    conceptFeeBdt: doc.conceptFeeBdt,
    designFeeBdt: doc.designFeeBdt,
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
    deliverables: doc.deliverables.map((d) => ({
      title: d.title,
      note: d.note,
      fileUrl: d.fileUrl,
      kind: d.kind,
      status: d.status,
      clientNote: d.clientNote,
      submittedAt: d.submittedAt.toISOString(),
      decidedAt: d.decidedAt?.toISOString(),
    })),
    commissionBdt: doc.commissionBdt,
    releasedToArchitectBdt: doc.releasedToArchitectBdt,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Loads a contract the caller is party to, or answers 404; null after replying. */
// `id` comes straight from req.params, which Express 5 types as string | string[].
async function findMyContractOr404(id: string | string[] | undefined, req: Request, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Contract not found" } });
    return null;
  }
  const doc = await Contract.findById(id);
  if (!doc || (String(doc.client) !== req.auth!.sub && String(doc.architect) !== req.auth!.sub)) {
    res.status(404).json({ error: { message: "Contract not found" } });
    return null;
  }
  return doc;
}

/** GET /api/projects/:id/contract — the project's contract (participants only). */
export async function getProjectContract(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;

  const isParty =
    String(project.owner) === req.auth!.sub ||
    (project.architect && String(project.architect) === req.auth!.sub) ||
    req.auth!.role === UserRole.ADMIN;
  if (!isParty) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const doc = await Contract.findOne({ project: project._id }).populate(withRefs);
  return res.json({ data: { contract: doc ? toContractDto(doc) : null } });
}

/** GET /api/contracts/mine — contracts where the caller is client or architect. */
export async function listMyContracts(req: Request, res: Response) {
  const docs = await Contract.find({
    $or: [{ client: req.auth!.sub }, { architect: req.auth!.sub }],
  })
    .sort({ createdAt: -1 })
    .populate(withRefs);
  return res.json({ data: { contracts: docs.map(toContractDto) } });
}

/**
 * POST /api/contracts/:id/pay-concept-fee — the client pays the small concept
 * fee (sandbox), which starts the concept work.
 */
export async function payConceptFee(req: Request, res: Response) {
  const doc = await findMyContractOr404(req.params.id!, req, res);
  if (!doc) return;
  if (String(doc.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the client pays the concept fee" } });
  }
  if (doc.status !== ContractStatus.AWAITING_CONCEPT_FEE) {
    return res.status(400).json({ error: { message: "The concept fee has already been paid" } });
  }

  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  doc.payments.push({
    kind: PaymentKind.CONCEPT_FEE,
    amountBdt: doc.conceptFeeBdt,
    method: parsed.data.method,
    reference: parsed.data.reference,
    at: new Date(),
  });
  doc.status = ContractStatus.CONCEPT_IN_PROGRESS;
  await doc.save();

  const populated = await doc.populate(withRefs);
  return res.json({ data: { contract: toContractDto(populated) } });
}

/**
 * POST /api/contracts/:id/fund-escrow — after approving the concept, the
 * client deposits the full design fee into escrow (sandbox). Design work
 * starts and the project moves to DESIGN_IN_PROGRESS.
 */
export async function fundEscrow(req: Request, res: Response) {
  const doc = await findMyContractOr404(req.params.id!, req, res);
  if (!doc) return;
  if (String(doc.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the client funds the escrow" } });
  }
  if (doc.status !== ContractStatus.AWAITING_ESCROW) {
    return res.status(400).json({ error: { message: "The escrow isn't awaiting a deposit" } });
  }

  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  doc.payments.push({
    kind: PaymentKind.ESCROW_DEPOSIT,
    amountBdt: doc.designFeeBdt,
    method: parsed.data.method,
    reference: parsed.data.reference,
    at: new Date(),
  });
  doc.status = ContractStatus.DESIGN_IN_PROGRESS;
  await doc.save();

  await Project.updateOne({ _id: doc.project }, { status: ProjectStatus.DESIGN_IN_PROGRESS });

  const populated = await doc.populate(withRefs);
  return res.json({ data: { contract: toContractDto(populated) } });
}

/**
 * POST /api/contracts/:id/deliverables — the architect submits work for
 * review. The contract phase decides what it is: a concept during
 * CONCEPT_IN_PROGRESS, the full design during DESIGN_IN_PROGRESS. Only one
 * submission may be awaiting review at a time.
 */
export async function submitDeliverable(req: Request, res: Response) {
  const doc = await findMyContractOr404(req.params.id!, req, res);
  if (!doc) return;
  if (String(doc.architect) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the architect submits deliverables" } });
  }

  let kind: DeliverableKind;
  if (doc.status === ContractStatus.CONCEPT_IN_PROGRESS) kind = DeliverableKind.CONCEPT;
  else if (doc.status === ContractStatus.DESIGN_IN_PROGRESS) kind = DeliverableKind.DESIGN;
  else {
    return res.status(400).json({ error: { message: "The contract isn't in a submission phase" } });
  }

  if (doc.deliverables.some((d) => d.status === DeliverableStatus.PENDING_REVIEW)) {
    return res.status(409).json({
      error: { message: "A submission is already waiting for the client's review" },
    });
  }

  const parsed = deliverableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  doc.deliverables.push({
    ...parsed.data,
    kind,
    status: DeliverableStatus.PENDING_REVIEW,
    submittedAt: new Date(),
  });
  await doc.save();

  const populated = await doc.populate(withRefs);
  return res.status(201).json({ data: { contract: toContractDto(populated) } });
}

/**
 * POST /api/contracts/:id/deliverables/:index/decide — the client reviews a
 * submission. Approving the concept opens the escrow step; approving the
 * design releases the escrow to the architect minus the platform commission
 * and moves the project to PERMIT_STAGE. Change requests on the design burn
 * one of the included revision rounds.
 */
export async function decideDeliverable(req: Request, res: Response) {
  const doc = await findMyContractOr404(req.params.id!, req, res);
  if (!doc) return;
  if (String(doc.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the client reviews deliverables" } });
  }

  const index = Number(req.params.index);
  const deliverable = Number.isInteger(index) ? doc.deliverables[index] : undefined;
  if (!deliverable) {
    return res.status(404).json({ error: { message: "Submission not found" } });
  }
  if (deliverable.status !== DeliverableStatus.PENDING_REVIEW) {
    return res
      .status(400)
      .json({ error: { message: "This submission has already been reviewed" } });
  }

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { action, note } = parsed.data;

  if (action === "request-changes") {
    if (deliverable.kind === DeliverableKind.DESIGN && doc.revisionsUsed >= doc.maxRevisions) {
      return res.status(400).json({
        error: {
          message: `All ${doc.maxRevisions} included revision rounds are used — approve the design or settle changes off-platform`,
        },
      });
    }
    deliverable.status = DeliverableStatus.CHANGES_REQUESTED;
    deliverable.clientNote = note;
    deliverable.decidedAt = new Date();
    if (deliverable.kind === DeliverableKind.DESIGN) doc.revisionsUsed += 1;
    await doc.save();
  } else {
    deliverable.status = DeliverableStatus.APPROVED;
    deliverable.clientNote = note;
    deliverable.decidedAt = new Date();

    if (deliverable.kind === DeliverableKind.CONCEPT) {
      doc.status = ContractStatus.AWAITING_ESCROW;
      await doc.save();
    } else {
      // Design approved: split the escrowed design fee between the platform
      // (commission) and the architect, and close the contract.
      doc.commissionBdt = Math.round(doc.designFeeBdt * doc.commissionRate);
      doc.releasedToArchitectBdt = doc.designFeeBdt - doc.commissionBdt;
      doc.payments.push({
        kind: PaymentKind.ESCROW_RELEASE,
        amountBdt: doc.releasedToArchitectBdt,
        at: new Date(),
      });
      doc.status = ContractStatus.COMPLETED;
      await doc.save();
      await Project.updateOne({ _id: doc.project }, { status: ProjectStatus.PERMIT_STAGE });
    }
  }

  const populated = await doc.populate(withRefs);
  return res.json({ data: { contract: toContractDto(populated) } });
}

/**
 * POST /api/contracts/:id/cancel — the client backs out before the escrow is
 * funded (the concept fee is payment for work done and isn't refunded). The
 * project returns to an open brief so a new architect can be found.
 */
export async function cancelContract(req: Request, res: Response) {
  const doc = await findMyContractOr404(req.params.id!, req, res);
  if (!doc) return;
  if (String(doc.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the client can cancel the contract" } });
  }

  const cancellable = [
    ContractStatus.AWAITING_CONCEPT_FEE,
    ContractStatus.CONCEPT_IN_PROGRESS,
    ContractStatus.AWAITING_ESCROW,
  ];
  if (!cancellable.includes(doc.status)) {
    return res.status(400).json({
      error: { message: "The contract can't be cancelled once the escrow is funded" },
    });
  }

  doc.status = ContractStatus.CANCELLED;
  await doc.save();

  // Re-open the brief and release the architect (their accepted proposal too).
  await Project.updateOne(
    { _id: doc.project },
    { status: ProjectStatus.BRIEF_POSTED, $unset: { architect: 1 } }
  );
  await Proposal.updateMany(
    { project: doc.project, architect: doc.architect, status: ProposalStatus.ACCEPTED },
    { status: ProposalStatus.DECLINED }
  );

  const populated = await doc.populate(withRefs);
  return res.json({ data: { contract: toContractDto(populated) } });
}
