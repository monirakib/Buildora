import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  DocumentCategory,
  UserRole,
  type ProjectDocument as ProjectDocumentDto,
} from "@buildora/shared";
import { ProjectDocument, type ProjectDocumentDoc } from "../models/ProjectDocument";
import type { ProjectDoc } from "../models/Project";
import { findProjectOr404 } from "./projects.controller";

const addDocumentSchema = z.object({
  title: z.string().trim().min(2, "Give the document a title").max(160),
  category: z.enum(DocumentCategory, { message: "Choose a category" }),
  fileUrl: z.url("Enter a valid file link (or upload an image first)"),
});

type UploaderRef = { _id: unknown; name: string };

function toDocumentDto(doc: HydratedDocument<ProjectDocumentDoc>): ProjectDocumentDto {
  const uploader = doc.uploader as unknown as UploaderRef;
  return {
    id: doc._id.toString(),
    title: doc.title,
    category: doc.category,
    fileUrl: doc.fileUrl,
    uploader: { id: String(uploader._id), name: uploader.name },
    createdAt: doc.createdAt.toISOString(),
  };
}

/** The archive is for the people on the project: owner, architect, or admin. */
function canAccessArchive(
  project: HydratedDocument<ProjectDoc>,
  auth: { sub: string; role: UserRole }
) {
  return (
    String(project.owner) === auth.sub ||
    (project.architect && String(project.architect) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

/** GET /api/projects/:id/documents — the project's archive, newest first. */
export async function listProjectDocuments(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessArchive(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const docs = await ProjectDocument.find({ project: project._id })
    .sort({ createdAt: -1 })
    .populate({ path: "uploader", select: "name" });
  return res.json({ data: { documents: docs.map(toDocumentDto) } });
}

/**
 * POST /api/projects/:id/documents — file something into the archive. The
 * URL comes from the image upload endpoint or an external link (Drive, etc.),
 * so the archive works even without Cloudinary keys configured.
 */
export async function addProjectDocument(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessArchive(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const parsed = addDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const created = await ProjectDocument.create({
    ...parsed.data,
    project: project._id,
    uploader: req.auth!.sub,
  });
  const populated = await created.populate({ path: "uploader", select: "name" });
  return res.status(201).json({ data: { document: toDocumentDto(populated) } });
}

/** DELETE /api/projects/:id/documents/:docId — uploader or project owner removes it. */
export async function deleteProjectDocument(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessArchive(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const { docId } = req.params;
  const doc = isValidObjectId(docId)
    ? await ProjectDocument.findOne({ _id: docId, project: project._id })
    : null;
  if (!doc) {
    return res.status(404).json({ error: { message: "Document not found" } });
  }

  const isUploader = String(doc.uploader) === req.auth!.sub;
  const isOwner = String(project.owner) === req.auth!.sub;
  if (!isUploader && !isOwner) {
    return res
      .status(403)
      .json({ error: { message: "Only the uploader or the owner can remove this" } });
  }

  await doc.deleteOne();
  return res.json({ data: { deleted: true } });
}
