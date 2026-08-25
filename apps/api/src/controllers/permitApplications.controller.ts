import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  PermitApplicationStatus,
  PermitType,
  UserRole,
  type PermitApplication as PermitApplicationDto,
  type PermitApplicationAdminView,
} from "@buildora/shared";
import { PermitApplication, type PermitApplicationDoc } from "../models/PermitApplication";
import type { ProjectDoc } from "../models/Project";
import { findProjectOr404 } from "./projects.controller";

function toPermitApplicationDto(doc: HydratedDocument<PermitApplicationDoc>): PermitApplicationDto {
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    permitType: doc.permitType,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    submittedDate: doc.submittedDate?.toISOString(),
    approvedDate: doc.approvedDate?.toISOString(),
    verifiedByAdmin: doc.verifiedByAdmin,
    verifiedAt: doc.verifiedAt?.toISOString(),
    verificationNote: doc.verificationNote,
    // Listed explicitly rather than spread — spreading a Mongoose subdocument
    // copies its internals, not its data, and every field comes out undefined.
    documents: doc.documents.map((d) => ({
      key: d.key,
      name: d.name,
      fileUrl: d.fileUrl,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Who may create/update a project's permit applications: the owner and the
 * professionals assigned to the project (they typically file the paperwork on
 * the owner's behalf), plus admins. Verification (below) is admin-only.
 */
function canManagePermits(
  project: Pick<HydratedDocument<ProjectDoc>, "owner" | "architect" | "engineer">,
  auth: { sub: string; role: UserRole }
) {
  return (
    String(project.owner) === auth.sub ||
    (project.architect && String(project.architect) === auth.sub) ||
    (project.engineer && String(project.engineer) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

async function findPermitApplicationOr404(id: string | string[] | undefined, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Permit application not found" } });
    return null;
  }
  const doc = await PermitApplication.findById(id);
  if (!doc) {
    res.status(404).json({ error: { message: "Permit application not found" } });
    return null;
  }
  return doc;
}

const createSchema = z.object({
  projectId: z.string().refine(isValidObjectId, "Invalid project"),
  permitType: z.enum(PermitType, { message: "Choose a permit type" }),
});

/** POST /api/permit-applications — start tracking a Planning or Construction permit for a project. */
export async function createPermitApplication(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  const project = await findProjectOr404(parsed.data.projectId, res);
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const existing = await PermitApplication.findOne({
    project: project._id,
    permitType: parsed.data.permitType,
  });
  if (existing) {
    return res.status(409).json({ error: { message: "This permit application already exists" } });
  }

  const created = await PermitApplication.create({
    project: project._id,
    permitType: parsed.data.permitType,
  });
  return res.status(201).json({ data: { application: toPermitApplicationDto(created) } });
}

/** GET /api/permit-applications?projectId=... — a project's Planning + Construction permit applications. */
export async function listPermitApplications(req: Request, res: Response) {
  const { projectId } = req.query;
  const project = await findProjectOr404(
    typeof projectId === "string" ? projectId : undefined,
    res
  );
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const docs = await PermitApplication.find({ project: project._id }).sort({ permitType: 1 });
  return res.json({ data: { applications: docs.map(toPermitApplicationDto) } });
}

/** GET /api/permit-applications/:id */
export async function getPermitApplication(req: Request, res: Response) {
  const app = await findPermitApplicationOr404(req.params.id, res);
  if (!app) return;
  const project = await findProjectOr404(app.project.toString(), res);
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Permit application not found" } });
  }
  return res.json({ data: { application: toPermitApplicationDto(app) } });
}

const updateSchema = z.object({
  status: z.enum(PermitApplicationStatus).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  submittedDate: z.coerce.date().optional(),
  approvedDate: z.coerce.date().optional(),
});

/**
 * PATCH /api/permit-applications/:id — the owner/architect/engineer update
 * their self-reported progress (RAJUK's real status, as they've observed it).
 * This never touches `verifiedByAdmin` — only the admin-only /verify route does.
 */
export async function updatePermitApplication(req: Request, res: Response) {
  const app = await findPermitApplicationOr404(req.params.id, res);
  if (!app) return;
  const project = await findProjectOr404(app.project.toString(), res);
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Permit application not found" } });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  if (parsed.data.status !== undefined) app.status = parsed.data.status;
  if (parsed.data.referenceNumber !== undefined) app.referenceNumber = parsed.data.referenceNumber;
  if (parsed.data.submittedDate !== undefined) app.submittedDate = parsed.data.submittedDate;
  if (parsed.data.approvedDate !== undefined) app.approvedDate = parsed.data.approvedDate;
  await app.save();

  return res.json({ data: { application: toPermitApplicationDto(app) } });
}

const addDocumentSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  fileUrl: z.url("Enter a valid file link (upload a document first)"),
});

/**
 * POST /api/permit-applications/:id/documents — attach a document uploaded
 * via /api/uploads/document. Re-uploading the same checklist `key` replaces
 * the previous file.
 */
export async function addPermitDocument(req: Request, res: Response) {
  const app = await findPermitApplicationOr404(req.params.id, res);
  if (!app) return;
  const project = await findProjectOr404(app.project.toString(), res);
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Permit application not found" } });
  }

  const parsed = addDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  app.documents = app.documents.filter((d) => d.key !== parsed.data.key);
  app.documents.push({ ...parsed.data, uploadedAt: new Date() });
  await app.save();

  return res.status(201).json({ data: { application: toPermitApplicationDto(app) } });
}

/** DELETE /api/permit-applications/:id/documents/:key */
export async function removePermitDocument(req: Request, res: Response) {
  const app = await findPermitApplicationOr404(req.params.id, res);
  if (!app) return;
  const project = await findProjectOr404(app.project.toString(), res);
  if (!project) return;
  if (!canManagePermits(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Permit application not found" } });
  }

  app.documents = app.documents.filter((d) => d.key !== req.params.key);
  await app.save();
  return res.json({ data: { application: toPermitApplicationDto(app) } });
}

const verifySchema = z.object({
  verificationNote: z.string().trim().max(500).optional(),
});

/**
 * PATCH /api/permit-applications/:id/verify — an admin confirms the
 * self-reported application against what the applicant showed them. This is
 * a manual confirmation, not a RAJUK lookup — Buildora has no RAJUK API access.
 */
export async function verifyPermitApplication(req: Request, res: Response) {
  const app = await findPermitApplicationOr404(req.params.id, res);
  if (!app) return;

  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }

  app.verifiedByAdmin = true;
  app.verifiedAt = new Date();
  app.verificationNote = parsed.data.verificationNote;
  await app.save();

  return res.json({ data: { application: toPermitApplicationDto(app) } });
}

type PopulatedApplication = Omit<HydratedDocument<PermitApplicationDoc>, "project"> & {
  project: HydratedDocument<ProjectDoc>;
};

/** GET /api/permit-applications/admin/pending — applications awaiting admin confirmation, across all projects. */
export async function listPendingPermitApplications(_req: Request, res: Response) {
  const docs = await PermitApplication.find({
    verifiedByAdmin: false,
    status: { $ne: PermitApplicationStatus.NOT_STARTED },
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .populate<{ project: HydratedDocument<ProjectDoc> }>({
      path: "project",
      select: "title address",
    });

  // `project` is populated here, not an ObjectId, so it can't go through
  // toPermitApplicationDto (which expects `doc.project.toString()` to be an
  // id) — build the row explicitly instead.
  const rows: PermitApplicationAdminView[] = (docs as PopulatedApplication[]).map((doc) => ({
    id: doc._id.toString(),
    projectId: doc.project._id.toString(),
    permitType: doc.permitType,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    submittedDate: doc.submittedDate?.toISOString(),
    approvedDate: doc.approvedDate?.toISOString(),
    verifiedByAdmin: doc.verifiedByAdmin,
    verifiedAt: doc.verifiedAt?.toISOString(),
    verificationNote: doc.verificationNote,
    documents: doc.documents.map((d) => ({
      key: d.key,
      name: d.name,
      fileUrl: d.fileUrl,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    project: {
      id: doc.project._id.toString(),
      title: doc.project.title,
      address: doc.project.address,
    },
  }));

  return res.json({ data: { applications: rows } });
}
