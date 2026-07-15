import { Router } from "express";
import { imageUpload, uploadImage } from "../controllers/uploads.controller";
import { requireAuth } from "../middleware/auth";

export const uploadsRouter = Router();

// multer parses the multipart body and puts the file on req.file.
uploadsRouter.post("/image", requireAuth, imageUpload.single("image"), uploadImage);
