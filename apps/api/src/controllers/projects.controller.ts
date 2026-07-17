import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  BuildingType,
  DEFAULT_PAGE_SIZE,
  ProjectStatus,
  ProposalStatus,
  UserRole,
  type Paginated,
  type Project as ProjectDto,
} from "@buildora/shared";
import { Project, type ProjectDoc } from "../models/Project";
import { Proposal } from "../models/Proposal";

const briefSchema = z
  .object({
    title: z.string().trim().min(5, "Give the project a short title").max(120),
    description: z
      .string()
      .trim()
      .min(30, "Describe the project in at least 30 characters")
      .max(3000),
    address: z.string().trim().min(5, "Enter the plot address").max(200),
    areaName: z.string().trim().min(2, "Enter the area, e.g. Dhanmondi").max(80),
    landAreaKatha: z.coerce.number().positive("Enter the land size in katha"),
    buildingType: z.enum(BuildingType, { message: "Choose a building type" }),
    floors: z.coerce.number().int().min(1, "At least one floor").max(50),
    budgetMinBdt: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().min(0).optional()
    ),
    budgetMaxBdt: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().min(0).optional()
    ),
    // ---- Plot details (all optional) ----
    roadWidthFt: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().min(1).max(200).optional()
    ),
    plotFacing: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().trim().max(40).optional()
    ),
    existingStructure: z.boolean().optional(),
    soilTestDone: z.boolean().optional(),
    // ---- Building requirements ----
    unitsPerFloor: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(20).optional()
    ),
    bedroomsPerUnit: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().min(1).max(20).optional()
    ),
    parkingSpaces: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().min(0).max(200).optional()
    ),
    hasLift: z.boolean().optional(),
    hasBasement: z.boolean().optional(),
    hasRooftopAmenities: z.boolean().optional(),
    // ---- Preferences & readiness ----
    designStyle: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().trim().max(60).optional()
    ),
    timeline: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().trim().max(40).optional()
    ),
    ownershipDocsReady: z.boolean().optional(),
    photoUrls: z.array(z.url()).max(6, "At most 6 plot photos").optional(),
  })
  .refine(
    (d) => d.budgetMinBdt == null || d.budgetMaxBdt == null || d.budgetMaxBdt >= d.budgetMinBdt,
    { message: "Maximum budget must be greater than the minimum", path: ["budgetMaxBdt"] }
  );

// A populated project has owner/architect refs replaced by user docs.
type PopulatedRef = {
  _id: unknown;
  name: string;
  username: string;
  profile?: { company?: string };
};

const withRefs = [
  { path: "owner", select: "name username" },
  { path: "architect", select: "name username profile.company" },
];

/** Shapes a project (owner + architect populated) for the client. */
export function toProjectDto(
  doc: HydratedDocument<ProjectDoc>,
  extra?: { pendingProposals?: number }
): ProjectDto {
  const owner = doc.owner as unknown as PopulatedRef;
  const architect = doc.architect as unknown as PopulatedRef | undefined;
  return {
    id: doc._id.toString(),
    owner: { id: String(owner._id), name: owner.name, username: owner.username },
    architect: architect
      ? {
          id: String(architect._id),
          name: architect.name,
          username: architect.username,
          company: architect.profile?.company,
        }
      : undefined,
    title: doc.title,
    description: doc.description,
    address: doc.address,
    areaName: doc.areaName,
    landAreaKatha: doc.landAreaKatha,
    buildingType: doc.buildingType,
    floors: doc.floors,
    budgetMinBdt: doc.budgetMinBdt,
    budgetMaxBdt: doc.budgetMaxBdt,
    roadWidthFt: doc.roadWidthFt,
    plotFacing: doc.plotFacing,
    existingStructure: doc.existingStructure,
    soilTestDone: doc.soilTestDone,
    unitsPerFloor: doc.unitsPerFloor,
    bedroomsPerUnit: doc.bedroomsPerUnit,
    parkingSpaces: doc.parkingSpaces,
    hasLift: doc.hasLift,
    hasBasement: doc.hasBasement,
    hasRooftopAmenities: doc.hasRooftopAmenities,
    designStyle: doc.designStyle,
    timeline: doc.timeline,
    ownershipDocsReady: doc.ownershipDocsReady,
    photoUrls: doc.photoUrls,
    status: doc.status,
    pendingProposals: extra?.pendingProposals,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The four professional roles (everything that isn't a land owner or admin). */
export const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/**
 * Who may see a project: its owner, the assigned architect, an admin — and,
 * while the brief is open, any professional (they need to read it to propose).
 */
export function canViewProject(
  doc: HydratedDocument<ProjectDoc>,
  auth: { sub: string; role: UserRole }
): boolean {
  // owner/architect may be populated docs or raw ObjectIds; String() covers both.
  const ownerId = String((doc.owner as { _id?: unknown })._id ?? doc.owner);
  const architectId = doc.architect
    ? String((doc.architect as { _id?: unknown })._id ?? doc.architect)
    : undefined;
  if (ownerId === auth.sub || architectId === auth.sub) return true;
  if (auth.role === UserRole.ADMIN) return true;
  return doc.status === ProjectStatus.BRIEF_POSTED && PROFESSIONAL_ROLES.includes(auth.role);
}

/** Loads a project by id or answers 404 for the caller; returns null after replying. */
// `id` comes straight from req.params, which Express 5 types as string | string[].
export async function findProjectOr404(id: string | string[] | undefined, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Project not found" } });
    return null;
  }
  const doc = await Project.findById(id);
  if (!doc) {
    res.status(404).json({ error: { message: "Project not found" } });
    return null;
  }
  return doc;
}

/**
 * POST /api/projects — a land owner creates a project brief. `publish: true`
 * posts it to architects immediately; otherwise it stays a private DRAFT they
 * can edit and post later.
 */
export async function createProject(req: Request, res: Response) {
  const parsed = briefSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const publish = req.body?.publish === true;

  const created = await Project.create({
    ...parsed.data,
    owner: req.auth!.sub,
    status: publish ? ProjectStatus.BRIEF_POSTED : ProjectStatus.DRAFT,
  });
  const populated = await created.populate(withRefs);
  return res.status(201).json({ data: { project: toProjectDto(populated) } });
}

/**
 * GET /api/projects/mine — a land owner's own projects, each with its count of
 * pending proposals; a professional gets the projects they're assigned to.
 */
export async function listMyProjects(req: Request, res: Response) {
  const filter =
    req.auth!.role === UserRole.LAND_OWNER
      ? { owner: req.auth!.sub }
      : { architect: req.auth!.sub };

  const docs = await Project.find(filter).sort({ createdAt: -1 }).populate(withRefs);

  // One aggregate for all pending-proposal counts instead of a query per project.
  const counts = new Map<string, number>();
  if (req.auth!.role === UserRole.LAND_OWNER && docs.length > 0) {
    const grouped = await Proposal.aggregate<{ _id: unknown; count: number }>([
      {
        $match: {
          project: { $in: docs.map((d) => d._id) },
          status: ProposalStatus.PENDING,
        },
      },
      { $group: { _id: "$project", count: { $sum: 1 } } },
    ]);
    for (const g of grouped) counts.set(String(g._id), g.count);
  }

  return res.json({
    data: {
      projects: docs.map((d) =>
        toProjectDto(d, { pendingProposals: counts.get(d._id.toString()) ?? 0 })
      ),
    },
  });
}

/**
 * GET /api/projects/briefs — open briefs for professionals to browse (the
 * route restricts this to professional roles). Supports text search and
 * pagination like the professionals directory.
 */
export async function listOpenBriefs(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));

  const filter: Record<string, unknown> = { status: ProjectStatus.BRIEF_POSTED };
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ title: rx }, { areaName: rx }, { description: rx }];
  }

  const [docs, total] = await Promise.all([
    Project.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate(withRefs),
    Project.countDocuments(filter),
  ]);

  const body: Paginated<ProjectDto> = {
    items: docs.map((d) => toProjectDto(d)),
    total,
    page,
    pageSize,
  };
  return res.json({ data: body });
}

/** GET /api/projects/:id — one project, if the caller is allowed to see it. */
export async function getProject(req: Request, res: Response) {
  const doc = await findProjectOr404(req.params.id!, res);
  if (!doc) return;
  if (!canViewProject(doc, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  const populated = await doc.populate(withRefs);
  return res.json({ data: { project: toProjectDto(populated) } });
}

/**
 * PATCH /api/projects/:id — the owner edits the brief. Only allowed before an
 * architect is engaged (DRAFT or BRIEF_POSTED) so accepted work can't have its
 * scope silently rewritten.
 */
export async function updateProject(req: Request, res: Response) {
  const doc = await findProjectOr404(req.params.id!, res);
  if (!doc) return;
  if (String(doc.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (doc.status !== ProjectStatus.DRAFT && doc.status !== ProjectStatus.BRIEF_POSTED) {
    return res.status(400).json({
      error: { message: "The brief can no longer be edited once an architect is engaged" },
    });
  }

  const parsed = briefSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  Object.assign(doc, parsed.data);
  await doc.save();
  const populated = await doc.populate(withRefs);
  return res.json({ data: { project: toProjectDto(populated) } });
}

/** POST /api/projects/:id/post — the owner publishes a DRAFT brief to architects. */
export async function postBrief(req: Request, res: Response) {
  const doc = await findProjectOr404(req.params.id!, res);
  if (!doc) return;
  if (String(doc.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (doc.status !== ProjectStatus.DRAFT) {
    return res.status(400).json({ error: { message: "Only a draft brief can be posted" } });
  }

  doc.status = ProjectStatus.BRIEF_POSTED;
  await doc.save();
  const populated = await doc.populate(withRefs);
  return res.json({ data: { project: toProjectDto(populated) } });
}

// The owner-driven stage moves. Everything in between (concept, design) is
// driven by contract actions, not by this endpoint.
const OWNER_TRANSITIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  [ProjectStatus.PERMIT_STAGE]: [ProjectStatus.UNDER_CONSTRUCTION],
  [ProjectStatus.UNDER_CONSTRUCTION]: [ProjectStatus.COMPLETED],
  [ProjectStatus.COMPLETED]: [ProjectStatus.ARCHIVED],
};

/** PATCH /api/projects/:id/status — owner advances permit → construction → done. */
export async function updateProjectStatus(req: Request, res: Response) {
  const doc = await findProjectOr404(req.params.id!, res);
  if (!doc) return;
  if (String(doc.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const parsed = z.object({ status: z.enum(ProjectStatus) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Choose a valid status" } });
  }

  const allowed = OWNER_TRANSITIONS[doc.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return res.status(400).json({
      error: { message: `Can't move this project from ${doc.status} to ${parsed.data.status}` },
    });
  }

  doc.status = parsed.data.status;
  await doc.save();
  const populated = await doc.populate(withRefs);
  return res.json({ data: { project: toProjectDto(populated) } });
}

/**
 * DELETE /api/projects/:id — the owner removes a brief that hasn't engaged an
 * architect yet. Anything further along is part of a contract and stays.
 */
export async function deleteProject(req: Request, res: Response) {
  const doc = await findProjectOr404(req.params.id!, res);
  if (!doc) return;
  if (String(doc.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (doc.status !== ProjectStatus.DRAFT && doc.status !== ProjectStatus.BRIEF_POSTED) {
    return res.status(400).json({
      error: { message: "A project with an engaged architect can't be deleted" },
    });
  }

  // Proposals on the brief go with it; nothing else references a brief-stage project.
  await Proposal.deleteMany({ project: doc._id });
  await doc.deleteOne();
  return res.json({ data: { deleted: true } });
}
