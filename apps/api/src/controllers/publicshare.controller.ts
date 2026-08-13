import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  ContractStatus,
  MilestoneStatus,
  StructuralStatus,
  type PublicProgress,
} from "@buildora/shared";
import { Project } from "../models/Project";
import { Contract } from "../models/Contract";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { EcpsApplication } from "../models/EcpsApplication";
import { BuildContract } from "../models/BuildContract";
import { Milestone } from "../models/Milestone";
import { Handover } from "../models/Handover";
import { findProjectOr404 } from "./projects.controller";

/**
 * A read-only progress page for people who aren't on Buildora — family abroad,
 * an investor, a relative paying for part of the build.
 *
 * The security model is the link itself: an unguessable token, no account, no
 * login. That is only acceptable because of what the payload deliberately
 * leaves out. No money, no contracts, no names of professionals, no addresses,
 * no documents — just what stage the build is at and how far the milestones
 * have got. Someone who finds the link learns that a building in Gulshan is
 * 60% framed, and nothing they could use.
 *
 * Revoking is unsetting the token, which breaks every copy of the link at once.
 */

/** 32 hex characters — long enough that guessing is not a threat model. */
function newToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * GET /api/public/progress/:token — the shared view. Unauthenticated by design.
 *
 * Everything here is derived server-side; the browser is never given an id it
 * could use to ask a different endpoint for more.
 */
export async function getPublicProgress(req: Request, res: Response) {
  const token = String(req.params.token ?? "");
  // Cheap shape check first, so a junk URL never reaches the database.
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return res.status(404).json({ error: { message: "This link isn't valid" } });
  }

  const project = await Project.findOne({ shareToken: token });
  if (!project) {
    return res
      .status(404)
      .json({ error: { message: "This link isn't valid or has been revoked" } });
  }

  const [contract, structural, ecps, build, handover] = await Promise.all([
    Contract.findOne({ project: project._id }).select("status"),
    StructuralEngagement.findOne({ project: project._id }).select("status"),
    EcpsApplication.findOne({ project: project._id }).select("completed currentStepOrder"),
    BuildContract.findOne({ project: project._id }).select("_id status"),
    Handover.findOne({ project: project._id }).select("acceptedByOwner handedOverAt"),
  ]);

  const milestones = build
    ? await Milestone.find({ buildContract: build._id })
        .sort({ order: 1 })
        .select("order title status amountPct")
    : [];

  // Construction progress is weighted by each stage's share of the contract
  // sum, the same rule the owner's own progress bar uses — so the number a
  // relative sees is the number the owner sees.
  const totalPct = milestones.reduce((sum, m) => sum + m.amountPct, 0);
  const donePct = milestones
    .filter((m) => m.status === MilestoneStatus.RELEASED)
    .reduce((sum, m) => sum + m.amountPct, 0);

  const body: PublicProgress = {
    title: project.title,
    // Locality only. The street address is deliberately not shared.
    areaName: project.areaName,
    buildingType: project.buildingType,
    floors: project.floors,
    status: project.status,
    designApproved: contract?.status === ContractStatus.COMPLETED,
    structuralApproved: structural?.status === StructuralStatus.COMPLETED,
    permitIssued: ecps?.completed === true,
    constructionStarted: !!build,
    constructionPercent: totalPct > 0 ? Math.round((donePct / totalPct) * 100) : 0,
    milestones: milestones.map((m) => ({
      order: m.order,
      title: m.title,
      done: m.status === MilestoneStatus.RELEASED,
    })),
    handedOver: handover?.acceptedByOwner === true,
    handedOverAt: handover?.handedOverAt,
    updatedAt: project.updatedAt.toISOString(),
  };

  return res.json({ data: { progress: body } });
}

/** POST /api/projects/:id/share — the owner turns the link on (or rotates it). */
export async function enableProjectShare(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  // Rotating on every call would break existing links unexpectedly, so an
  // already-shared project keeps its token unless the caller asks to rotate.
  const rotate = req.body?.rotate === true;
  if (!project.shareToken || rotate) {
    project.shareToken = newToken();
    await project.save();
  }

  return res.json({ data: { shareToken: project.shareToken } });
}

/** DELETE /api/projects/:id/share — revoke, breaking every copy of the link. */
export async function disableProjectShare(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  project.shareToken = undefined;
  await project.save();
  return res.json({ data: { shareToken: null } });
}

/** GET /api/projects/:id/share — whether it's shared, for the owner's toggle. */
export async function getProjectShare(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  return res.json({ data: { shareToken: project.shareToken ?? null } });
}
