import type { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { env } from "../config/env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Multer keeps the file in memory (never on disk) so it can be streamed
 * straight to Cloudinary. 5 MB cap, images only — anything else is rejected
 * before the handler runs.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files can be uploaded"));
  },
});

/**
 * POST /api/uploads/image — authenticated users upload one image (form field
 * "image") and get back its hosted URL. The URL is then saved into whatever
 * profile field it belongs to (avatar, certificate, portfolio photo).
 */
export async function uploadImage(req: Request, res: Response) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({
      error: { message: "Image uploads aren't configured (missing Cloudinary keys)" },
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: { message: "Attach an image file" } });
  }

  // upload_stream is callback-based; wrap it in a promise so we can await it.
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      // One folder per user keeps the media library browsable.
      { folder: `buildora/${req.auth!.sub}`, resource_type: "image" },
      (error, uploaded) => (uploaded ? resolve(uploaded) : reject(error))
    );
    stream.end(req.file!.buffer);
  });

  return res.status(201).json({ data: { url: result.secure_url } });
}
