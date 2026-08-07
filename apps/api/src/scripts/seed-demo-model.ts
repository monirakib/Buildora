/**
 * Seeds a 3D-model document onto an existing engaged project so the
 * "View in 3D" viewer in the Document archive has something to show.
 *
 * It attaches a public sample .glb (Khronos glTF sample: a small house-like
 * model) to the Monir Akib / Nusrat Jahan Madhurzo project, uploaded as the
 * architect — mirroring the real flow (architect files the model, land owner
 * views it in 3D).
 *
 * Run from apps/api: `pnpm tsx src/scripts/seed-demo-model.ts`. Safe to re-run —
 * the document is matched by (project, title) so it upserts instead of
 * duplicating.
 */
import mongoose from "mongoose";
import { DocumentCategory } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { ProjectDocument } from "../models/ProjectDocument";

// Public, CORS-enabled sample .glb from the Khronos glTF-Sample-Assets repo.
const SAMPLE_GLB =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb";
const DOC_TITLE = "Concept massing model (3D)";

async function main() {
  await connectDb();

  const owner = await User.findOne({ email: "monirakib10@gmail.com" });
  const architect = await User.findOne({ email: "nusrat.jahan.madhurzo@g.bracu.ac.bd" });
  if (!owner || !architect) {
    throw new Error("Expected demo owner/architect accounts not found — check emails.");
  }

  const project = await Project.findOne({ owner: owner._id, architect: architect._id });
  if (!project) {
    throw new Error("No project links this owner and architect — nothing to attach to.");
  }

  const doc = await ProjectDocument.findOneAndUpdate(
    { project: project._id, title: DOC_TITLE },
    {
      project: project._id,
      uploader: architect._id, // the architect files it, per the real flow
      title: DOC_TITLE,
      category: DocumentCategory.MODEL_3D,
      fileUrl: SAMPLE_GLB,
    },
    { upsert: true, new: true }
  );

  console.log(`Attached 3D model to project "${project.title}" (${project._id}).`);
  console.log(`  document: ${doc?.title} [${doc?.category}]`);
  console.log(
    `  view it as: ${owner.name} <${owner.email}>  →  open the project → Document archive → "View in 3D"`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed-demo-model] Failed:", err);
  process.exit(1);
});
