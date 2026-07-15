import { Schema, model, Types } from "mongoose";
import { DocumentCategory } from "@buildora/shared";

/**
 * One archived file on a project — a design, permit paper, contract, or site
 * photo. `fileUrl` is either a Cloudinary upload or an external link the user
 * pasted (e.g. a Drive share), so the archive works even without upload keys.
 */
export interface ProjectDocumentDoc {
  project: Types.ObjectId;
  uploader: Types.ObjectId;
  title: string;
  category: DocumentCategory;
  fileUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const projectDocumentSchema = new Schema<ProjectDocumentDoc>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: {
      type: String,
      enum: Object.values(DocumentCategory),
      default: DocumentCategory.OTHER,
    },
    fileUrl: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const ProjectDocument = model<ProjectDocumentDoc>("ProjectDocument", projectDocumentSchema);
