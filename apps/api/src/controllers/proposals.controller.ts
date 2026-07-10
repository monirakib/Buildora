import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  CONCEPT_FEE_BDT,
  ContractStatus,
  ProjectStatus,
  ProposalStatus,
  UserRole,
  VerificationStatus,
  type Proposal as ProposalDto,
} from "@buildora/shared";
import { Contract } from "../models/Contract";
import { Project } from "../models/Project";
import { Proposal, type ProposalDoc } from "../models/Proposal";
import { findProjectOr404 } from "./projects.controller";

const createProposalSchema = z.object({
  coverLetter: z
    .string()
    .trim()
    .min(30, "Tell the owner why you're the right fit (at least 30 characters)")
    .max(2000),
  conceptFeeBdt: z.coerce
    .number()
    .min(CONCEPT_FEE_BDT.MIN, `Concept fee must be at least ${CONCEPT_FEE_BDT.MIN} BDT`)
    .max(CONCEPT_FEE_BDT.MAX, `Concept fee can be at most ${CONCEPT_FEE_BDT.MAX} BDT`),
  designFeeBdt: z.coerce.number().min(1000, "Quote your full design fee (at least 1,000 BDT)"),
  estimatedWeeks: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(104).optional()
  ),
});

// Populated refs on a proposal document.
type ArchitectRef = {
  _id: unknown;
  name: string;
  username: string;
  verificationStatus: VerificationStatus;
  profile?: { company?: string; avatarUrl?: string };
};
type ProjectRef = { _id: unknown; title: string };

const withRefs = [
  {
    path: "architect",
    select: "name username verificationStatus profile.company profile.avatarUrl",
  },
  { path: "project", select: "title" },
];

/** Shapes a proposal (project + architect populated) for the client. */
function toProposalDto(doc: HydratedDocument<ProposalDoc>): ProposalDto {
  const architect = doc.architect as unknown as ArchitectRef;
  const project = doc.project as unknown as ProjectRef;
  return {
    id: doc._id.toString(),
    project: { id: String(project._id), title: project.title },
    architect: {
      id: String(architect._id),
      name: architect.name,
      username: architect.username,
      company: architect.profile?.company,
      avatarUrl: architect.profile?.avatarUrl,
      verificationStatus: architect.verificationStatus,
    },
    coverLetter: doc.coverLetter,
    conceptFeeBdt: doc.conceptFeeBdt,
    designFeeBdt: doc.designFeeBdt,
    estimatedWeeks: doc.estimatedWeeks,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * POST /api/projects/:id/proposals — an architect pitches on a posted brief.
 * Guards: brief must still be open, no proposing on your own project, and one
 * live proposal per architect per brief (the partial unique index backs this).
 */
export async function createProposal(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (project.status !== ProjectStatus.BRIEF_POSTED) {
    return res
      .status(400)
      .json({ error: { message: "This brief is no longer open for proposals" } });
  }
  if (String(project.owner) === req.auth!.sub) {
    return res.status(400).json({ error: { message: "You can't propose on your own project" } });
  }

  const parsed = createProposalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const existing = await Proposal.findOne({
    project: project._id,
    architect: req.auth!.sub,
    status: { $in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
  });
  if (existing) {
    return res
      .status(409)
      .json({ error: { message: "You already have a live proposal on this brief" } });
  }

  const created = await Proposal.create({
    ...parsed.data,
    project: project._id,
    architect: req.auth!.sub,
  });
  const populated = await created.populate(withRefs);
  return res.status(201).json({ data: { proposal: toProposalDto(populated) } });
}

/**
 * GET /api/projects/:id/proposals — the owner sees every proposal on their
 * brief; an architect sees only their own on that project.
 */
export async function listProjectProposals(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;

  const isOwner = String(project.owner) === req.auth!.sub;
  if (!isOwner && req.auth!.role === UserRole.LAND_OWNER) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const filter = isOwner
    ? { project: project._id }
    : { project: project._id, architect: req.auth!.sub };
  const docs = await Proposal.find(filter).sort({ createdAt: -1 }).populate(withRefs);
  return res.json({ data: { proposals: docs.map(toProposalDto) } });
}

/** GET /api/proposals/mine — an architect's proposals across all briefs. */
export async function listMyProposals(req: Request, res: Response) {
  const docs = await Proposal.find({ architect: req.auth!.sub })
    .sort({ createdAt: -1 })
    .populate(withRefs);
  return res.json({ data: { proposals: docs.map(toProposalDto) } });
}

/** Loads a proposal by id or answers 404; returns null after replying. */
// `id` comes straight from req.params, which Express 5 types as string | string[].
async function findProposalOr404(id: string | string[] | undefined, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Proposal not found" } });
    return null;
  }
  const doc = await Proposal.findById(id);
  if (!doc) {
    res.status(404).json({ error: { message: "Proposal not found" } });
    return null;
  }
  return doc;
}

/**
 * POST /api/proposals/:id/accept — the owner picks this architect. Assigns
 * them to the project, moves it to CONCEPT_STAGE, declines the other pending
 * proposals, and opens the design contract at AWAITING_CONCEPT_FEE.
 */
export async function acceptProposal(req: Request, res: Response) {
  const proposal = await findProposalOr404(req.params.id!, res);
  if (!proposal) return;

  const project = await Project.findById(proposal.project);
  if (!project || String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Proposal not found" } });
  }
  if (proposal.status !== ProposalStatus.PENDING) {
    return res.status(400).json({ error: { message: "This proposal has already been decided" } });
  }
  if (project.status !== ProjectStatus.BRIEF_POSTED) {
    return res
      .status(400)
      .json({ error: { message: "An architect is already engaged on this project" } });
  }

  proposal.status = ProposalStatus.ACCEPTED;
  await proposal.save();

  project.architect = proposal.architect;
  project.status = ProjectStatus.CONCEPT_STAGE;
  await project.save();

  // The losing proposals close automatically; their architects can see why.
  await Proposal.updateMany(
    { project: project._id, status: ProposalStatus.PENDING },
    { status: ProposalStatus.DECLINED }
  );

  await Contract.create({
    project: project._id,
    client: project.owner,
    architect: proposal.architect,
    status: ContractStatus.AWAITING_CONCEPT_FEE,
    conceptFeeBdt: proposal.conceptFeeBdt,
    designFeeBdt: proposal.designFeeBdt,
  });

  const populated = await proposal.populate(withRefs);
  return res.json({ data: { proposal: toProposalDto(populated) } });
}

/** POST /api/proposals/:id/decline — the owner passes on this proposal. */
export async function declineProposal(req: Request, res: Response) {
  const proposal = await findProposalOr404(req.params.id!, res);
  if (!proposal) return;

  const project = await Project.findById(proposal.project);
  if (!project || String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Proposal not found" } });
  }
  if (proposal.status !== ProposalStatus.PENDING) {
    return res.status(400).json({ error: { message: "This proposal has already been decided" } });
  }

  proposal.status = ProposalStatus.DECLINED;
  await proposal.save();
  const populated = await proposal.populate(withRefs);
  return res.json({ data: { proposal: toProposalDto(populated) } });
}

/** POST /api/proposals/:id/withdraw — the architect pulls a pending proposal. */
export async function withdrawProposal(req: Request, res: Response) {
  const proposal = await findProposalOr404(req.params.id!, res);
  if (!proposal) return;
  if (String(proposal.architect) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Proposal not found" } });
  }
  if (proposal.status !== ProposalStatus.PENDING) {
    return res.status(400).json({ error: { message: "Only a pending proposal can be withdrawn" } });
  }

  proposal.status = ProposalStatus.WITHDRAWN;
  await proposal.save();
  const populated = await proposal.populate(withRefs);
  return res.json({ data: { proposal: toProposalDto(populated) } });
}
