import { Router } from "express";
import {
  documentUpload,
  imageUpload,
  modelUpload,
  uploadDocument,
  uploadImage,
  uploadModel,
} from "../controllers/uploads.controller";
import { requireAuth } from "../middleware/auth";

export const uploadsRouter = Router();

// multer parses the multipart body and puts the file on req.file.
uploadsRouter.post("/image", requireAuth, imageUpload.single("image"), uploadImage);
uploadsRouter.post("/model", requireAuth, modelUpload.single("model"), uploadModel);
uploadsRouter.post("/document", requireAuth, documentUpload.single("document"), uploadDocument);
