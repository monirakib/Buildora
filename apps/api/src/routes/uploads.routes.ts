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
import { rateLimit } from "../middleware/rateLimit";

export const uploadsRouter = Router();

/**
 * Uploads land in Cloudinary's free tier, which is measured in storage and
 * bandwidth per month — so the cost of an unlimited upload endpoint isn't a
 * slow server, it's the platform's image hosting stopping for everyone until
 * the month rolls over. multer's own per-file size caps (in the controller)
 * limit how big one upload is; this limits how many.
 *
 * Keyed by user, not IP: uploading is only possible with an account, and a
 * shared campus network would otherwise pool everyone's allowance. Thirty an
 * hour is far more than a person filling in a portfolio or a day's site photos
 * needs, and far less than a script wants.
 */
const uploadLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  keyBy: (req) => req.auth?.sub ?? req.ip ?? "unknown",
  message: "That's a lot of uploads in one hour, try again later",
});

// multer parses the multipart body and puts the file on req.file. The limiter
// runs before it, so a refused request is turned away before the file is read.
uploadsRouter.post("/image", requireAuth, uploadLimit, imageUpload.single("image"), uploadImage);
uploadsRouter.post("/model", requireAuth, uploadLimit, modelUpload.single("model"), uploadModel);
uploadsRouter.post(
  "/document",
  requireAuth,
  uploadLimit,
  documentUpload.single("document"),
  uploadDocument
);
