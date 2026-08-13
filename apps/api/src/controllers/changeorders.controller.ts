import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  BuildContractStatus,
  ChangeOrderStatus,
  MilestoneStatus,
  NotificationType,
  type ChangeOrder as ChangeOrderDto,
} from "@buildora/shared";
import { ChangeOrder, type ChangeOrderDoc } from "../models/ChangeOrder";
import { BuildContract } from "../models/BuildContract";
import { Milestone } from "../models/Milestone";
import { notify, preview } from "../services/notifications";
import { refId } from "../utils/refId";

/**
 * Variations to a live construction contract.
 *
 * The design goal was to add no second payment path. An approved change order
 * that costs money appends a milestone, and from that point the variation is
 * funded, inspected and released by exactly the same machinery as the original
 * scope — the owner funds the tranche through the existing checkout, an
 * engineer passes it, the money moves. Nothing new to trust.
 *
 * A negative delta (work removed) takes the money off the contract sum and
 * creates nothing, because there is no tranche to fund.
 */

function toDto(doc: HydratedDocument<ChangeOrderDoc>): ChangeOrderDto {
  const raiser = doc.raisedBy as unknown as
    { _id: unknown; name: string; username: string; company?: string } | undefined;
  return {
    id: doc._id.toString(),
    projectId: refId(doc.project),
    buildContractId: refId(doc.buildContract),
    raisedBy: raiser?.name
      ? {
          id: String(raiser._id),
          name: raiser.name,
          username: raiser.username,
          company: raiser.company,
        }
      : { id: refId(doc.raisedBy), name: "", username: "" },
    title: doc.title,
    description: doc.description,
    amountDeltaBdt: doc.amountDeltaBdt,
    timelineDeltaWeeks: doc.timelineDeltaWeeks,
    status: doc.status,
    decisionNote: doc.decisionNote,
    decidedAt: doc.decidedAt?.toISOString(),
    milestoneId: doc.milestone ? refId(doc.milestone) : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const raiserRef = { path: "raisedBy", select: "name username company" };

const proposeSchema = z.object({
  title: z.string().trim().min(4, "Give the variation a title").max(160),
  description: z.string().trim().min(20, "Explain what the work is and why it's needed").max(2000),
  amountDeltaBdt: z.coerce
    .number({ message: "Enter the cost change" })
    .min(-100_000_000_000)
    .max(100_000_000_000),
  timelineDeltaWeeks: z.coerce.number().min(-260).max(260).default(0),
});

/**
 * POST /api/build/:id/change-orders — the contractor proposes a variation.
 *
 * Contractor-only on purpose: they're the ones who discover that the ground is
 * softer than the soil report said. An owner who wants extra work asks for it
 * and the contractor prices it, which is the same conversation in the right
 * order.
 */
export async function proposeChangeOrder(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Build contract not found" } });
  }
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const contract = await BuildContract.findById(req.params.id);
  if (!contract) return res.status(404).json({ error: { message: "Build contract not found" } });
  if (refId(contract.contractor) !== req.auth!.sub) {
    return res
      .status(403)
      .json({ error: { message: "Only the contractor can propose a variation" } });
  }
  if (contract.status !== BuildContractStatus.ACTIVE) {
    return res.status(409).json({ error: { message: "This contract is no longer active" } });
  }

  // A variation can't take the contract below zero — that isn't a variation,
  // it's a cancellation, and there's a separate path for that.
  if (contract.contractSumBdt + parsed.data.amountDeltaBdt < 0) {
    return res.status(400).json({
      error: { message: "That would take the contract sum below zero" },
    });
  }

  const doc = await ChangeOrder.create({
    project: contract.project,
    buildContract: contract._id,
    raisedBy: req.auth!.sub,
    ...parsed.data,
  });

  const sign = parsed.data.amountDeltaBdt >= 0 ? "+" : "−";
  notify(refId(contract.client), {
    type: NotificationType.CONTRACT,
    title: "Variation proposed",
    body: `${parsed.data.title}, ${sign}৳${Math.abs(parsed.data.amountDeltaBdt).toLocaleString("en-BD")}. ${preview(parsed.data.description, 80)}`,
    link: `/projects/${refId(contract.project)}?tab=contractor`,
    actorId: req.auth!.sub,
  });

  await doc.populate(raiserRef);
  return res.status(201).json({ data: { changeOrder: toDto(doc) } });
}

/** GET /api/build/:id/change-orders — every variation on this contract. */
export async function listChangeOrders(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Build contract not found" } });
  }
  const contract = await BuildContract.findById(req.params.id);
  if (!contract) return res.status(404).json({ error: { message: "Build contract not found" } });

  const callerId = req.auth!.sub;
  const isParty =
    refId(contract.client) === callerId ||
    refId(contract.contractor) === callerId ||
    (contract.engineer && refId(contract.engineer) === callerId);
  if (!isParty) {
    return res.status(404).json({ error: { message: "Build contract not found" } });
  }

  const docs = await ChangeOrder.find({ buildContract: contract._id })
    .sort({ createdAt: -1 })
    .populate(raiserRef);
  return res.json({ data: { changeOrders: docs.map(toDto) } });
}

const decideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(1000).optional()
  ),
});

/**
 * POST /api/build/change-orders/:id/decide — the owner accepts or refuses.
 *
 * Approving is the moment the contract actually changes: the sum and the
 * programme move, and a chargeable variation gets a milestone appended to the
 * end of the schedule so it can be funded like any other stage.
 */
export async function decideChangeOrder(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Variation not found" } });
  }
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Choose approve or reject" } });
  }

  const doc = await ChangeOrder.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: { message: "Variation not found" } });
  if (doc.status !== ChangeOrderStatus.PROPOSED) {
    return res.status(409).json({ error: { message: "This variation has already been decided" } });
  }

  const contract = await BuildContract.findById(doc.buildContract);
  if (!contract) return res.status(404).json({ error: { message: "Build contract not found" } });
  if (refId(contract.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can decide a variation" } });
  }

  if (parsed.data.action === "reject") {
    doc.status = ChangeOrderStatus.REJECTED;
    doc.decisionNote = parsed.data.note;
    doc.decidedAt = new Date();
    await doc.save();

    notify(refId(doc.raisedBy), {
      type: NotificationType.CONTRACT,
      title: "Variation rejected",
      body: parsed.data.note ? preview(parsed.data.note, 120) : `${doc.title} was not approved.`,
      link: `/projects/${refId(doc.project)}?tab=contractor`,
      actorId: req.auth!.sub,
    });

    await doc.populate(raiserRef);
    return res.json({ data: { changeOrder: toDto(doc) } });
  }

  // ---- Approved ----
  contract.contractSumBdt += doc.amountDeltaBdt;
  contract.timelineWeeks = Math.max(contract.timelineWeeks + doc.timelineDeltaWeeks, 1);

  // Chargeable work gets its own tranche at the end of the schedule. Its
  // percentage is expressed against the *new* contract sum so the schedule's
  // percentages still describe the contract they belong to.
  if (doc.amountDeltaBdt > 0) {
    const last = await Milestone.findOne({ buildContract: contract._id }).sort({ order: -1 });
    const milestone = await Milestone.create({
      buildContract: contract._id,
      project: contract.project,
      order: (last?.order ?? 0) + 1,
      title: `Variation, ${doc.title}`,
      description: doc.description,
      amountPct:
        contract.contractSumBdt > 0
          ? Math.round((doc.amountDeltaBdt / contract.contractSumBdt) * 1000) / 10
          : 0,
      amountBdt: doc.amountDeltaBdt,
      status: MilestoneStatus.PENDING,
    });
    doc.milestone = milestone._id;
  }

  await contract.save();
  doc.status = ChangeOrderStatus.APPROVED;
  doc.decisionNote = parsed.data.note;
  doc.decidedAt = new Date();
  await doc.save();

  const sign = doc.amountDeltaBdt >= 0 ? "+" : "−";
  notify(refId(doc.raisedBy), {
    type: NotificationType.CONTRACT,
    title: "Variation approved",
    body: `${doc.title}, contract sum is now ৳${contract.contractSumBdt.toLocaleString("en-BD")} (${sign}৳${Math.abs(doc.amountDeltaBdt).toLocaleString("en-BD")}).`,
    link: `/projects/${refId(doc.project)}?tab=contractor`,
    actorId: req.auth!.sub,
  });

  await doc.populate(raiserRef);
  return res.json({ data: { changeOrder: toDto(doc) } });
}

/** POST /api/build/change-orders/:id/withdraw — the contractor pulls it back. */
export async function withdrawChangeOrder(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Variation not found" } });
  }
  const doc = await ChangeOrder.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: { message: "Variation not found" } });
  if (refId(doc.raisedBy) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the contractor can withdraw it" } });
  }
  if (doc.status !== ChangeOrderStatus.PROPOSED) {
    return res.status(409).json({ error: { message: "This variation has already been decided" } });
  }

  doc.status = ChangeOrderStatus.WITHDRAWN;
  doc.decidedAt = new Date();
  await doc.save();
  await doc.populate(raiserRef);
  return res.json({ data: { changeOrder: toDto(doc) } });
}
