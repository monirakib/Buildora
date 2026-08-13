import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument, type Types } from "mongoose";
import { z } from "zod";
import {
  BuildContractStatus,
  InspectionVerdict,
  MilestoneStatus,
  NotificationType,
  PaymentKind,
  PaymentMethod,
  ProjectStatus,
  UserRole,
  type BuildContract as BuildContractDto,
  type Inspection as InspectionDto,
  type Milestone as MilestoneDto,
} from "@buildora/shared";
import { BuildContract, type BuildContractDoc } from "../models/BuildContract";
import { InspectionTemplate } from "../models/InspectionTemplate";
import { Milestone, type InspectionDoc, type MilestoneDoc } from "../models/Milestone";
import { Project, type ProjectDoc } from "../models/Project";
import { hasLiveDispute } from "./disputes.controller";
import { notify } from "../services/notifications";
import { refId } from "../utils/refId";
import { findProjectOr404 } from "./projects.controller";

/**
 * Construction: the build contract, its milestone schedule, and the engineer
 * sign-off that opens each tranche.
 *
 * The gate is the point of this module. A contractor claiming a stage is done
 * moves it to AWAITING_INSPECTION and nothing else — no money moves until an
 * engineer files a passing inspection, and even then the owner performs the
 * release. Three different people, each doing the one thing they're placed to
 * judge: the contractor knows when they finished, the engineer knows whether
 * it's built right, the owner owns the money.
 */

type UserRefDoc = { _id: unknown; name: string; username: string; company?: string };

function toUserRef(ref: unknown) {
  const u = ref as UserRefDoc | undefined;
  return u && typeof u === "object" && "name" in u
    ? { id: String(u._id), name: u.name, username: u.username, company: u.company }
    : undefined;
}

function toInspectionDto(doc: InspectionDoc, milestoneId: string): InspectionDto {
  return {
    id: doc._id.toString(),
    milestoneId,
    inspector: toUserRef(doc.inspector) ?? { id: refId(doc.inspector), name: "", username: "" },
    templateName: doc.templateName,
    results: doc.results.map((r) => ({ label: r.label, passed: r.passed, note: r.note })),
    verdict: doc.verdict,
    notes: doc.notes,
    photoUrls: doc.photoUrls,
    signature: doc.signature,
    // Listed field by field: a Mongoose subdocument spread copies its internals
    // rather than its data. Same trap as the site diary's weather snapshot.
    location: doc.location
      ? {
          lat: doc.location.lat,
          lng: doc.location.lng,
          address: doc.location.address,
          distanceFromPlotM: doc.location.distanceFromPlotM,
        }
      : undefined,
    inspectedAt: doc.inspectedAt.toISOString(),
  };
}

function toMilestoneDto(doc: HydratedDocument<MilestoneDoc>): MilestoneDto {
  const id = doc._id.toString();
  return {
    id,
    buildContractId: doc.buildContract.toString(),
    projectId: doc.project.toString(),
    order: doc.order,
    title: doc.title,
    description: doc.description,
    amountPct: doc.amountPct,
    amountBdt: doc.amountBdt,
    targetDate: doc.targetDate?.toISOString(),
    status: doc.status,
    claimedAt: doc.claimedAt?.toISOString(),
    releasedAt: doc.releasedAt?.toISOString(),
    releasedAmountBdt: doc.releasedAmountBdt,
    inspections: doc.inspections.map((i) => toInspectionDto(i, id)),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toContractDto(
  doc: HydratedDocument<BuildContractDoc>,
  projectTitle: string
): BuildContractDto {
  return {
    id: doc._id.toString(),
    projectId: refId(doc.project),
    projectTitle,
    tenderId: doc.tender.toString(),
    bidId: doc.bid.toString(),
    client: toUserRef(doc.client) ?? { id: refId(doc.client), name: "", username: "" },
    contractor: toUserRef(doc.contractor) ?? { id: refId(doc.contractor), name: "", username: "" },
    engineer: toUserRef(doc.engineer),
    status: doc.status,
    contractSumBdt: doc.contractSumBdt,
    timelineWeeks: doc.timelineWeeks,
    commissionRate: doc.commissionRate,
    payments: doc.payments.map((p) => ({
      kind: p.kind,
      amountBdt: p.amountBdt,
      method: p.method,
      reference: p.reference,
      at: p.at.toISOString(),
    })),
    releasedToContractorBdt: doc.releasedToContractorBdt,
    commissionBdt: doc.commissionBdt,
    cancelReason: doc.cancelReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const withParties = [
  { path: "client", select: "name username company" },
  { path: "contractor", select: "name username company" },
  { path: "engineer", select: "name username company" },
];

/** Everyone with a stake in the build can read it. */
function canView(
  contract: HydratedDocument<BuildContractDoc>,
  auth: { sub: string; role: UserRole }
) {
  return (
    refId(contract.client) === auth.sub ||
    refId(contract.contractor) === auth.sub ||
    (contract.engineer && refId(contract.engineer) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

/** Loads a build contract with its parties, or answers 404. */
async function findContractOr404(id: unknown, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Build contract not found" } });
    return null;
  }
  const contract = await BuildContract.findById(id).populate(withParties);
  if (!contract) {
    res.status(404).json({ error: { message: "Build contract not found" } });
    return null;
  }
  return contract;
}

/** Loads a milestone that really belongs to this contract. */
async function findMilestoneOr404(contractId: Types.ObjectId, milestoneId: unknown, res: Response) {
  if (typeof milestoneId !== "string" || !isValidObjectId(milestoneId)) {
    res.status(404).json({ error: { message: "Milestone not found" } });
    return null;
  }
  const milestone = await Milestone.findOne({
    _id: milestoneId,
    buildContract: contractId,
  }).populate({ path: "inspections.inspector", select: "name username company" });
  if (!milestone) {
    res.status(404).json({ error: { message: "Milestone not found" } });
    return null;
  }
  return milestone;
}

/** Reloads the schedule in build order, with inspectors populated. */
async function loadSchedule(contractId: Types.ObjectId) {
  const milestones = await Milestone.find({ buildContract: contractId })
    .sort({ order: 1 })
    .populate({ path: "inspections.inspector", select: "name username company" });
  return milestones.map(toMilestoneDto);
}

/**
 * GET /api/projects/:id/build — the build contract and its schedule.
 * Answers `{ contract: null }` rather than 404 when there isn't one yet, so the
 * project page can render its empty state without treating it as an error.
 */
export async function getProjectBuild(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;

  const contract = await BuildContract.findOne({ project: project._id })
    .sort({ createdAt: -1 })
    .populate(withParties);
  if (!contract) return res.json({ data: { contract: null, milestones: [] } });

  if (!canView(contract, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  return res.json({
    data: {
      contract: toContractDto(contract, project.title),
      milestones: await loadSchedule(contract._id),
    },
  });
}

/** GET /api/build/mine — every build contract the caller is a party to. */
export async function listMyBuildContracts(req: Request, res: Response) {
  const me = req.auth!.sub;
  const contracts = await BuildContract.find({
    $or: [{ client: me }, { contractor: me }, { engineer: me }],
  })
    .sort({ createdAt: -1 })
    .populate(withParties)
    .populate({ path: "project", select: "title" });

  return res.json({
    data: {
      contracts: contracts.map((c) => {
        const project = c.project as unknown as { title?: string };
        return toContractDto(c, project?.title ?? "");
      }),
    },
  });
}

const fundSchema = z.object({
  method: z.enum(PaymentMethod, { message: "Pick a payment channel" }),
  reference: z.string().trim().min(4, "Enter the transaction reference").max(120),
});

/**
 * POST /api/build/:id/milestones/:milestoneId/fund — record a tranche deposit
 * made outside the gateway. The gateway path settles through
 * payments.controller.ts instead; both end in `applyMilestoneFunding`.
 */
export async function fundMilestone(req: Request, res: Response) {
  const contract = await findContractOr404(req.params.id, res);
  if (!contract) return;
  if (refId(contract.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner funds a milestone" } });
  }

  const milestone = await findMilestoneOr404(contract._id, req.params.milestoneId, res);
  if (!milestone) return;

  const parsed = fundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid payment" } });
  }

  if (milestone.status !== MilestoneStatus.PENDING) {
    return res.status(409).json({ error: { message: "This milestone is already funded" } });
  }

  await applyMilestoneFunding(contract, milestone, parsed.data.method, parsed.data.reference);

  return res.json({
    data: {
      contract: toContractDto(contract, ""),
      milestones: await loadSchedule(contract._id),
    },
  });
}

/**
 * Credits a funded tranche. Shared by the manual form and the gateway callback,
 * so both paths write exactly the same ledger entry and status change.
 */
export async function applyMilestoneFunding(
  contract: HydratedDocument<BuildContractDoc>,
  milestone: HydratedDocument<MilestoneDoc>,
  method: PaymentMethod,
  reference: string
) {
  contract.payments.push({
    kind: PaymentKind.ESCROW_DEPOSIT,
    amountBdt: milestone.amountBdt,
    method,
    reference,
    at: new Date(),
  });
  await contract.save();

  milestone.status = MilestoneStatus.FUNDED;
  await milestone.save();

  void notify(refId(contract.contractor), {
    type: NotificationType.MILESTONE,
    title: "Milestone funded",
    body: `"${milestone.title}" is in escrow — you can start this stage.`,
    link: `/projects/${refId(contract.project)}`,
  });
}

/** POST /api/build/:id/milestones/:milestoneId/claim — contractor says it's done. */
export async function claimMilestone(req: Request, res: Response) {
  const contract = await findContractOr404(req.params.id, res);
  if (!contract) return;
  if (refId(contract.contractor) !== req.auth!.sub) {
    return res
      .status(403)
      .json({ error: { message: "Only the contractor can mark a stage complete" } });
  }

  const milestone = await findMilestoneOr404(contract._id, req.params.milestoneId, res);
  if (!milestone) return;

  // FUNDED means the money is waiting; a failed inspection drops back to FUNDED
  // so the contractor can fix the defects and call the engineer again.
  if (milestone.status !== MilestoneStatus.FUNDED) {
    return res.status(409).json({
      error: {
        message:
          milestone.status === MilestoneStatus.PENDING
            ? "The owner hasn't funded this stage yet"
            : "This stage isn't waiting on the contractor",
      },
    });
  }

  milestone.status = MilestoneStatus.AWAITING_INSPECTION;
  milestone.claimedAt = new Date();
  await milestone.save();

  // The engineer is the one who has to act next; the owner is told so nothing
  // happens on their project without them knowing.
  const audience = [contract.engineer, contract.client].filter(Boolean).map(refId);
  for (const userId of new Set(audience)) {
    void notify(userId, {
      type: NotificationType.MILESTONE,
      title: "Stage ready for inspection",
      body: `The contractor says "${milestone.title}" is complete.`,
      link: `/projects/${refId(contract.project)}`,
      actorId: req.auth!.sub,
    });
  }

  return res.json({ data: { milestones: await loadSchedule(contract._id) } });
}

const inspectSchema = z.object({
  templateName: z.string().trim().min(1, "Pick a checklist").max(120),
  results: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        passed: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1, "Work through the checklist"),
  verdict: z.enum(InspectionVerdict, { message: "Give a verdict" }),
  notes: z.string().trim().max(2000).optional(),
  photoUrls: z.array(z.url("Each photo must be a valid link")).max(12).default([]),
  signature: z.string().trim().min(2, "Sign the inspection with your name").max(120),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().trim().max(300).optional(),
    })
    .optional(),
});

/**
 * Great-circle distance in metres. Used only to record how far the inspector
 * stood from the plot pin, so a reader can judge the evidence for themselves —
 * it deliberately does not block filing. GPS is wrong indoors often enough
 * that refusing an inspection over it would punish honest engineers, and the
 * owner still holds the release either way.
 */
function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * POST /api/build/:id/milestones/:milestoneId/inspect — the engineer signs.
 *
 * A passing verdict opens the release for the owner; a failing one sends the
 * stage back to the contractor. Either way the inspection is kept forever: the
 * history is the point, not just the latest answer.
 */
export async function inspectMilestone(req: Request, res: Response) {
  const contract = await findContractOr404(req.params.id, res);
  if (!contract) return;

  const isEngineer = contract.engineer && refId(contract.engineer) === req.auth!.sub;
  if (!isEngineer && req.auth!.role !== UserRole.ADMIN) {
    return res.status(403).json({
      error: { message: "Only the project's structural engineer can sign off a stage" },
    });
  }

  const milestone = await findMilestoneOr404(contract._id, req.params.milestoneId, res);
  if (!milestone) return;
  if (milestone.status !== MilestoneStatus.AWAITING_INSPECTION) {
    return res
      .status(409)
      .json({ error: { message: "This stage hasn't been submitted for inspection" } });
  }

  const parsed = inspectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid inspection",
        details: parsed.error.issues,
      },
    });
  }

  // Record how far the inspector was from the plot, when both points are known.
  const project = await Project.findById(contract.project).select("location title");
  let location = parsed.data.location;
  if (location && project?.location) {
    location = {
      ...location,
      ...{
        distanceFromPlotM: distanceMetres(location, {
          lat: project.location.lat,
          lng: project.location.lng,
        }),
      },
    } as typeof location;
  }

  milestone.inspections.push({
    inspector: req.auth!.sub,
    templateName: parsed.data.templateName,
    results: parsed.data.results,
    verdict: parsed.data.verdict,
    notes: parsed.data.notes,
    photoUrls: parsed.data.photoUrls,
    signature: parsed.data.signature,
    location,
    inspectedAt: new Date(),
  } as never);

  const passed = parsed.data.verdict !== InspectionVerdict.FAIL;
  milestone.status = passed ? MilestoneStatus.INSPECTION_PASSED : MilestoneStatus.FUNDED;
  await milestone.save();

  const audience = [contract.client, contract.contractor].map(refId);
  for (const userId of new Set(audience)) {
    void notify(userId, {
      type: NotificationType.MILESTONE,
      title: passed ? "Inspection passed" : "Inspection failed",
      body: passed
        ? `"${milestone.title}" was signed off by the engineer.`
        : `"${milestone.title}" did not pass — see the engineer's notes.`,
      link: `/projects/${refId(contract.project)}`,
      actorId: req.auth!.sub,
    });
  }

  return res.json({ data: { milestones: await loadSchedule(contract._id) } });
}

/**
 * POST /api/build/:id/milestones/:milestoneId/release — the owner pays out.
 *
 * Only reachable after a passing inspection. Releases the tranche minus the
 * platform commission, exactly as the design and structural contracts do, and
 * closes the whole contract once the last stage is paid.
 */
export async function releaseMilestone(req: Request, res: Response) {
  const contract = await findContractOr404(req.params.id, res);
  if (!contract) return;
  if (refId(contract.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can release a tranche" } });
  }

  const milestone = await findMilestoneOr404(contract._id, req.params.milestoneId, res);
  if (!milestone) return;
  if (milestone.status !== MilestoneStatus.INSPECTION_PASSED) {
    return res.status(409).json({
      error: { message: "An engineer has to pass this stage before the money can be released" },
    });
  }

  // An open dispute freezes this tranche. Without the freeze the owner could
  // simply release the moment the contractor raised one, and the dispute would
  // be decoration — only a supervisor's decision reopens the money.
  if (await hasLiveDispute(milestone._id)) {
    return res.status(409).json({
      error: {
        code: "DISPUTE_OPEN",
        message: "This tranche is frozen while the dispute on it is being reviewed",
      },
    });
  }

  const commission = Math.round(milestone.amountBdt * contract.commissionRate);
  const net = milestone.amountBdt - commission;

  contract.payments.push({
    kind: PaymentKind.ESCROW_RELEASE,
    amountBdt: net,
    at: new Date(),
  });
  contract.releasedToContractorBdt += net;
  contract.commissionBdt += commission;

  milestone.status = MilestoneStatus.RELEASED;
  milestone.releasedAt = new Date();
  milestone.releasedAmountBdt = net;
  await milestone.save();

  // The build is over when every stage has been paid out.
  const outstanding = await Milestone.countDocuments({
    buildContract: contract._id,
    status: { $ne: MilestoneStatus.RELEASED },
  });
  if (outstanding === 0) {
    contract.status = BuildContractStatus.COMPLETED;
    await Project.findByIdAndUpdate(contract.project, { status: ProjectStatus.COMPLETED });
  }
  await contract.save();

  void notify(refId(contract.contractor), {
    type: NotificationType.MILESTONE,
    title: "Tranche released",
    body: `${net.toLocaleString()} BDT released for "${milestone.title}".`,
    link: `/projects/${refId(contract.project)}`,
    actorId: req.auth!.sub,
  });

  return res.json({
    data: {
      contract: toContractDto(contract, ""),
      milestones: await loadSchedule(contract._id),
      completed: outstanding === 0,
    },
  });
}

const editMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  targetDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
    .optional(),
});

/**
 * PATCH /api/build/:id/milestones/:milestoneId — retitle or date a stage.
 *
 * Only while it is still PENDING, and never the amount: once a stage is funded
 * the parties have agreed what that money is for, and the percentages were
 * frozen against the contract sum at award.
 */
export async function updateMilestone(req: Request, res: Response) {
  const contract = await findContractOr404(req.params.id, res);
  if (!contract) return;
  if (refId(contract.client) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can edit the schedule" } });
  }

  const milestone = await findMilestoneOr404(contract._id, req.params.milestoneId, res);
  if (!milestone) return;
  if (milestone.status !== MilestoneStatus.PENDING) {
    return res
      .status(409)
      .json({ error: { message: "This stage has already been funded — it can't be changed" } });
  }

  const parsed = editMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid milestone" } });
  }

  milestone.title = parsed.data.title;
  milestone.description = parsed.data.description;
  milestone.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined;
  await milestone.save();

  return res.json({ data: { milestones: await loadSchedule(contract._id) } });
}

/** GET /api/inspection-templates — the checklists an engineer can work from. */
export async function listInspectionTemplates(_req: Request, res: Response) {
  const templates = await InspectionTemplate.find({ active: true }).sort({ name: 1 });
  return res.json({
    data: {
      templates: templates.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        description: t.description,
        items: t.items,
        active: t.active,
      })),
    },
  });
}

export type { ProjectDoc };
