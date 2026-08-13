import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument, type Types } from "mongoose";
import { z } from "zod";
import {
  DisputeResolution,
  DisputeScope,
  DisputeStatus,
  LIVE_DISPUTE_STATUSES,
  NotificationType,
  PaymentKind,
  UserRole,
  type Dispute as DisputeDto,
} from "@buildora/shared";
import { Dispute, type DisputeDoc } from "../models/Dispute";
import { Contract } from "../models/Contract";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { Milestone } from "../models/Milestone";
import { BuildContract } from "../models/BuildContract";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { notify, notifyMany, preview } from "../services/notifications";

/**
 * Disputes over money held in escrow.
 *
 * The rule that makes this worth having: while a dispute is live, the money it
 * concerns is frozen. `hasLiveDispute` below is called by the release paths in
 * the contract, structural and build controllers, and they refuse. Without that
 * freeze, whoever clicked first would win and the dispute would be decoration.
 *
 * Only a supervisor resolves one, and their decision is what moves the money —
 * the parties never settle it between themselves inside the platform, because
 * then there would be nothing to appeal to.
 */

/**
 * Whether anything live is filed against this contract, engagement or
 * milestone. Exported because the release paths guard on it.
 */
export async function hasLiveDispute(targetId: string | Types.ObjectId): Promise<boolean> {
  return (
    (await Dispute.exists({
      target: targetId,
      status: { $in: [...LIVE_DISPUTE_STATUSES] },
    })) !== null
  );
}

type PopulatedDispute = HydratedDocument<DisputeDoc>;

const refOf = (value: unknown) => {
  const u = value as {
    _id?: unknown;
    name?: string;
    username?: string;
    profile?: { company?: string };
  };
  return {
    id: String(u?._id ?? value),
    name: u?.name ?? "",
    username: u?.username ?? "",
    company: u?.profile?.company,
  };
};

function toDto(doc: PopulatedDispute, projectTitle: string): DisputeDto {
  return {
    id: doc._id.toString(),
    projectId: String((doc.project as { _id?: unknown })._id ?? doc.project),
    projectTitle,
    scope: doc.scope,
    targetId: doc.target.toString(),
    targetLabel: doc.targetLabel,
    raisedBy: refOf(doc.raisedBy),
    against: refOf(doc.against),
    reason: doc.reason,
    amountClaimedBdt: doc.amountClaimedBdt,
    evidence: doc.evidence.map((e) => ({
      caption: e.caption,
      fileUrl: e.fileUrl,
      uploadedBy: String(e.uploadedBy),
      at: e.at.toISOString(),
    })),
    status: doc.status,
    resolution: doc.resolution,
    resolutionNote: doc.resolutionNote,
    refundBdt: doc.refundBdt,
    releasedBdt: doc.releasedBdt,
    resolvedBy: doc.resolvedBy ? refOf(doc.resolvedBy) : undefined,
    resolvedAt: doc.resolvedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const withParties = [
  { path: "raisedBy", select: "name username profile.company" },
  { path: "against", select: "name username profile.company" },
  { path: "resolvedBy", select: "name username" },
  { path: "project", select: "title" },
];

/**
 * Resolves what a dispute is actually about, and who the other side is.
 *
 * Returns null when the caller isn't a party to it — a land owner cannot open
 * a dispute on somebody else's contract, and the 404 (rather than a 403) keeps
 * us from confirming that the id exists at all.
 */
async function resolveTarget(
  scope: DisputeScope,
  targetId: string,
  callerId: string
): Promise<{
  projectId: Types.ObjectId;
  against: Types.ObjectId;
  label: string;
  heldBdt: number;
} | null> {
  if (!isValidObjectId(targetId)) return null;

  if (scope === DisputeScope.DESIGN_CONTRACT) {
    const contract = await Contract.findById(targetId);
    if (!contract) return null;
    const client = String(contract.client);
    const architect = String(contract.architect);
    if (callerId !== client && callerId !== architect) return null;
    const deposited = contract.payments
      .filter((p) => p.kind === PaymentKind.ESCROW_DEPOSIT)
      .reduce((sum, p) => sum + p.amountBdt, 0);
    const released = contract.payments
      .filter((p) => p.kind === PaymentKind.ESCROW_RELEASE || p.kind === PaymentKind.REFUND)
      .reduce((sum, p) => sum + p.amountBdt, 0);
    return {
      projectId: contract.project,
      against: callerId === client ? contract.architect : contract.client,
      label: "Design contract",
      heldBdt: Math.max(deposited - released, 0),
    };
  }

  if (scope === DisputeScope.STRUCTURAL) {
    const engagement = await StructuralEngagement.findById(targetId);
    if (!engagement) return null;
    const client = String(engagement.client);
    const engineer = String(engagement.engineer);
    if (callerId !== client && callerId !== engineer) return null;
    const deposited = engagement.payments
      .filter((p) => p.kind === PaymentKind.ESCROW_DEPOSIT)
      .reduce((sum, p) => sum + p.amountBdt, 0);
    const released = engagement.payments
      .filter((p) => p.kind === PaymentKind.ESCROW_RELEASE || p.kind === PaymentKind.REFUND)
      .reduce((sum, p) => sum + p.amountBdt, 0);
    return {
      projectId: engagement.project,
      against: callerId === client ? engagement.engineer : engagement.client,
      label: "Structural engagement",
      heldBdt: Math.max(deposited - released, 0),
    };
  }

  // BUILD_MILESTONE
  const milestone = await Milestone.findById(targetId);
  if (!milestone) return null;
  const contract = await BuildContract.findById(milestone.buildContract);
  if (!contract) return null;
  const client = String(contract.client);
  const contractor = String(contract.contractor);
  if (callerId !== client && callerId !== contractor) return null;
  return {
    projectId: contract.project,
    against: callerId === client ? contract.contractor : contract.client,
    label: `Milestone ${milestone.order}, ${milestone.title}`,
    // A milestone's escrow is funded as a single tranche, so what's held is
    // simply its own amount until it's released.
    heldBdt: milestone.status === "RELEASED" ? 0 : milestone.amountBdt,
  };
}

const raiseSchema = z.object({
  scope: z.enum(DisputeScope),
  targetId: z.string().min(1),
  reason: z.string().trim().min(20, "Explain the problem in at least 20 characters").max(2000),
  amountClaimedBdt: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(100_000_000_000).optional()
  ),
  evidence: z
    .array(
      z.object({
        caption: z.string().trim().min(1).max(200),
        fileUrl: z.url(),
      })
    )
    .max(10, "At most 10 pieces of evidence")
    .default([]),
});

/** POST /api/disputes — either party opens one. */
export async function raiseDispute(req: Request, res: Response) {
  const parsed = raiseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }
  const { scope, targetId, reason, amountClaimedBdt, evidence } = parsed.data;
  const callerId = req.auth!.sub;

  const target = await resolveTarget(scope, targetId, callerId);
  if (!target) {
    return res.status(404).json({ error: { message: "Nothing to dispute here" } });
  }

  // One live dispute per target. A second would leave two supervisors moving
  // the same escrow, and there is only one pot of money to move.
  if (await hasLiveDispute(targetId)) {
    return res.status(409).json({
      error: { message: "There's already an open dispute on this" },
    });
  }

  const doc = await Dispute.create({
    project: target.projectId,
    scope,
    target: targetId,
    targetLabel: target.label,
    raisedBy: callerId,
    against: target.against,
    reason,
    amountClaimedBdt,
    evidence: evidence.map((e) => ({ ...e, uploadedBy: callerId, at: new Date() })),
    status: DisputeStatus.OPEN,
  });

  await doc.populate(withParties);
  const projectTitle = (doc.project as unknown as { title?: string })?.title ?? "";

  // The other side, so they can respond, and the supervisors, who decide.
  notify(String(target.against), {
    type: NotificationType.CONTRACT,
    title: "A dispute was raised",
    body: `${target.label}: ${preview(reason, 100)}`,
    link: `/projects/${String(target.projectId)}?tab=overview`,
    actorId: callerId,
  });
  const admins = await User.find({ role: UserRole.ADMIN }).select("_id");
  notifyMany(
    admins.map((a) => a._id.toString()),
    {
      type: NotificationType.SYSTEM,
      title: "Dispute needs a decision",
      body: `${target.label}, ৳${(target.heldBdt || 0).toLocaleString("en-BD")} is frozen pending review.`,
      link: "/admin/disputes",
      actorId: callerId,
    }
  );

  return res.status(201).json({ data: { dispute: toDto(doc, projectTitle) } });
}

/** GET /api/disputes/mine — every dispute the caller is a party to. */
export async function listMyDisputes(req: Request, res: Response) {
  const callerId = req.auth!.sub;
  const docs = await Dispute.find({ $or: [{ raisedBy: callerId }, { against: callerId }] })
    .sort({ createdAt: -1 })
    .populate(withParties);

  return res.json({
    data: {
      disputes: docs.map((d) =>
        toDto(d, (d.project as unknown as { title?: string })?.title ?? "")
      ),
    },
  });
}

/** GET /api/disputes?status= — the supervisor's queue. */
export async function listDisputes(req: Request, res: Response) {
  const statusParam = String(req.query.status ?? "");
  const filter: Record<string, unknown> = Object.values(DisputeStatus).includes(
    statusParam as DisputeStatus
  )
    ? { status: statusParam }
    : { status: { $in: [...LIVE_DISPUTE_STATUSES] } };

  const docs = await Dispute.find(filter).sort({ createdAt: 1 }).limit(100).populate(withParties);
  return res.json({
    data: {
      disputes: docs.map((d) =>
        toDto(d, (d.project as unknown as { title?: string })?.title ?? "")
      ),
    },
  });
}

/** GET /api/disputes/:id — one dispute, for a party or a supervisor. */
export async function getDispute(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Dispute not found" } });
  }
  const doc = await Dispute.findById(req.params.id).populate(withParties);
  if (!doc) return res.status(404).json({ error: { message: "Dispute not found" } });

  const callerId = req.auth!.sub;
  const isParty =
    String((doc.raisedBy as { _id?: unknown })._id ?? doc.raisedBy) === callerId ||
    String((doc.against as { _id?: unknown })._id ?? doc.against) === callerId;
  if (!isParty && req.auth!.role !== UserRole.ADMIN) {
    return res.status(404).json({ error: { message: "Dispute not found" } });
  }

  // A supervisor opening a fresh one moves it into review, so the parties can
  // see it's actually being looked at.
  if (doc.status === DisputeStatus.OPEN && req.auth!.role === UserRole.ADMIN) {
    doc.status = DisputeStatus.UNDER_REVIEW;
    await doc.save();
  }

  return res.json({
    data: { dispute: toDto(doc, (doc.project as unknown as { title?: string })?.title ?? "") },
  });
}

/** POST /api/disputes/:id/withdraw — the raiser drops it, unfreezing the money. */
export async function withdrawDispute(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Dispute not found" } });
  }
  const doc = await Dispute.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: { message: "Dispute not found" } });
  if (String(doc.raisedBy) !== req.auth!.sub) {
    return res
      .status(403)
      .json({ error: { message: "Only the person who raised it can withdraw it" } });
  }
  if (!LIVE_DISPUTE_STATUSES.includes(doc.status)) {
    return res.status(409).json({ error: { message: "This dispute is already closed" } });
  }

  doc.status = DisputeStatus.WITHDRAWN;
  await doc.save();

  notify(String(doc.against), {
    type: NotificationType.CONTRACT,
    title: "Dispute withdrawn",
    body: `${doc.targetLabel}. The hold on this money has been lifted.`,
    link: `/projects/${String(doc.project)}`,
    actorId: req.auth!.sub,
  });

  await doc.populate(withParties);
  return res.json({
    data: { dispute: toDto(doc, (doc.project as unknown as { title?: string })?.title ?? "") },
  });
}

const resolveSchema = z.object({
  resolution: z.enum(DisputeResolution),
  note: z.string().trim().min(10, "Explain the decision").max(2000),
  /** Required for SPLIT — how much of the held money returns to the client. */
  refundBdt: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).optional()
  ),
});

/**
 * POST /api/disputes/:id/resolve — a supervisor decides, and the money moves.
 *
 * This is the only place in the platform where escrow moves on someone else's
 * say-so, which is why it's supervisor-only and why every outcome is written
 * into the contract's own payment ledger rather than adjusted quietly.
 */
export async function resolveDispute(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Dispute not found" } });
  }
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const doc = await Dispute.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: { message: "Dispute not found" } });
  if (!LIVE_DISPUTE_STATUSES.includes(doc.status)) {
    return res.status(409).json({ error: { message: "This dispute is already resolved" } });
  }

  const { resolution, note } = parsed.data;

  // Re-read what's actually held now, rather than trusting the figure claimed
  // when the dispute was raised — money may have moved since.
  const held = await heldAmountFor(doc);
  let refund = 0;
  let release = 0;

  if (resolution === DisputeResolution.REFUND_TO_CLIENT) {
    refund = held;
  } else if (resolution === DisputeResolution.RELEASE_TO_PROFESSIONAL) {
    release = held;
  } else if (resolution === DisputeResolution.SPLIT) {
    const asked = parsed.data.refundBdt;
    if (asked === undefined) {
      return res.status(400).json({
        error: { message: "A split needs the amount going back to the client" },
      });
    }
    if (asked > held) {
      return res.status(400).json({
        error: { message: `Only ৳${held.toLocaleString("en-BD")} is held on this` },
      });
    }
    refund = asked;
    release = held - asked;
  }

  if (refund > 0 || release > 0) {
    await applyLedger(doc, refund, release);
  }

  doc.status = DisputeStatus.RESOLVED;
  doc.resolution = resolution;
  doc.resolutionNote = note;
  doc.refundBdt = refund;
  doc.releasedBdt = release;
  doc.resolvedBy = req.auth!.sub as unknown as DisputeDoc["resolvedBy"];
  doc.resolvedAt = new Date();
  await doc.save();

  const money =
    refund > 0 && release > 0
      ? `৳${refund.toLocaleString("en-BD")} refunded, ৳${release.toLocaleString("en-BD")} released.`
      : refund > 0
        ? `৳${refund.toLocaleString("en-BD")} refunded to the client.`
        : release > 0
          ? `৳${release.toLocaleString("en-BD")} released.`
          : "No money moved.";

  for (const party of [String(doc.raisedBy), String(doc.against)]) {
    notify(party, {
      type: NotificationType.PAYMENT,
      title: "Dispute resolved",
      body: `${doc.targetLabel}, ${money} ${preview(note, 90)}`,
      link: `/projects/${String(doc.project)}`,
      actorId: req.auth!.sub,
    });
  }

  await doc.populate(withParties);
  return res.json({
    data: { dispute: toDto(doc, (doc.project as unknown as { title?: string })?.title ?? "") },
  });
}

/** How much is still held against whatever this dispute is about, right now. */
async function heldAmountFor(doc: HydratedDocument<DisputeDoc>): Promise<number> {
  const net = (payments: { kind: PaymentKind; amountBdt: number }[]) => {
    const inbound = payments
      .filter((p) => p.kind === PaymentKind.ESCROW_DEPOSIT)
      .reduce((s, p) => s + p.amountBdt, 0);
    const outbound = payments
      .filter((p) => p.kind === PaymentKind.ESCROW_RELEASE || p.kind === PaymentKind.REFUND)
      .reduce((s, p) => s + p.amountBdt, 0);
    return Math.max(inbound - outbound, 0);
  };

  if (doc.scope === DisputeScope.DESIGN_CONTRACT) {
    const c = await Contract.findById(doc.target);
    return c ? net(c.payments) : 0;
  }
  if (doc.scope === DisputeScope.STRUCTURAL) {
    const e = await StructuralEngagement.findById(doc.target);
    return e ? net(e.payments) : 0;
  }
  const m = await Milestone.findById(doc.target);
  return m && m.status !== "RELEASED" ? m.amountBdt : 0;
}

/**
 * Writes the outcome into the relevant ledger.
 *
 * Both sides of a split are recorded as separate entries rather than one net
 * figure, so the contract's history reads as what actually happened: some money
 * went back, some went on.
 */
async function applyLedger(
  doc: HydratedDocument<DisputeDoc>,
  refund: number,
  release: number
): Promise<void> {
  const now = new Date();
  const entries = [
    ...(refund > 0 ? [{ kind: PaymentKind.REFUND, amountBdt: refund, at: now }] : []),
    ...(release > 0 ? [{ kind: PaymentKind.ESCROW_RELEASE, amountBdt: release, at: now }] : []),
  ];

  if (doc.scope === DisputeScope.DESIGN_CONTRACT) {
    await Contract.findByIdAndUpdate(doc.target, { $push: { payments: { $each: entries } } });
    return;
  }
  if (doc.scope === DisputeScope.STRUCTURAL) {
    await StructuralEngagement.findByIdAndUpdate(doc.target, {
      $push: { payments: { $each: entries } },
    });
    return;
  }

  // A milestone's money lives on its build contract's ledger; the milestone
  // itself only records that it is no longer awaiting a decision.
  const milestone = await Milestone.findById(doc.target);
  if (!milestone) return;
  await BuildContract.findByIdAndUpdate(milestone.buildContract, {
    $push: { payments: { $each: entries } },
    ...(release > 0 ? { $inc: { releasedToContractorBdt: release } } : {}),
  });
  if (release > 0) {
    milestone.status = "RELEASED" as typeof milestone.status;
    milestone.releasedAt = now;
    milestone.releasedAmountBdt = release;
    await milestone.save();
  }
}

/** GET /api/projects/:id/disputes — everything filed on one project. */
export async function listProjectDisputes(req: Request, res: Response) {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: { message: "Project not found" } });

  const callerId = req.auth!.sub;
  const isParticipant =
    String(project.owner) === callerId ||
    String(project.architect ?? "") === callerId ||
    String(project.engineer ?? "") === callerId ||
    req.auth!.role === UserRole.ADMIN;
  if (!isParticipant) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const docs = await Dispute.find({ project: project._id })
    .sort({ createdAt: -1 })
    .populate(withParties);
  return res.json({ data: { disputes: docs.map((d) => toDto(d, project.title)) } });
}
