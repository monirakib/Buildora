import type { Request, Response } from "express";
import multer from "multer";
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary";

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
  if (!isCloudinaryConfigured()) {
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

/**
 * Multer for 3D design models. GLB is binary (no reliable mimetype across
 * browsers), so the filter goes by extension. 15 MB cap — enough for an
 * architectural model exported from SketchUp/Revit/Blender.
 */
export const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(glb|gltf)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error("Only .glb / .gltf 3D models can be uploaded"));
  },
});

/**
 * POST /api/uploads/model — authenticated users upload one 3D model (form
 * field "model") and get back its hosted URL. Stored on Cloudinary as a raw
 * file (it's not an image), served back to the in-browser 3D viewer.
 */
export async function uploadModel(req: Request, res: Response) {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      error: { message: "Uploads aren't configured (missing Cloudinary keys)" },
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: { message: "Attach a .glb model file" } });
  }

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      // "raw" keeps the bytes untouched; keep the .glb extension in the URL
      // so loaders and browsers recognise the format.
      {
        folder: `buildora/${req.auth!.sub}/models`,
        resource_type: "raw",
        format: "glb",
      },
      (error, uploaded) => (uploaded ? resolve(uploaded) : reject(error))
    );
    stream.end(req.file!.buffer);
  });

  return res.status(201).json({ data: { url: result.secure_url } });
}
