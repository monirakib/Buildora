import type { NidImageCheck } from "@buildora/shared";
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary";

/**
 * Inspects an uploaded NID card photo as a *file* rather than as a picture:
 * how big it is, what shape it is, and what wrote it.
 *
 * The point isn't to detect forgery — a forged card photographed properly
 * passes every check here, and nothing offline can say otherwise. The point is
 * the careless end of the range: a portrait crop with half the number missing,
 * a 200-pixel screenshot of a screenshot, or a file whose EXIF header still
 * names the editor it was assembled in.
 *
 * Everything it returns is a flag for the supervisor. None of it blocks a
 * submission (see gradeNidCheck), because every one of these has an innocent
 * explanation and a real applicant would be the one paying for a false
 * accusation.
 */

/** The card standard: ISO/IEC 7810 ID-1, 85.60 mm × 53.98 mm. */
export const ID1_ASPECT_RATIO = 85.6 / 53.98; // ≈ 1.586

/**
 * How far from 1.586 a photo may sit and still be plausible.
 *
 * Deliberately wide. People photograph the card on a table with their phone
 * rather than cropping to the bezel, so a genuine upload is routinely 4:3
 * (1.33) or 16:9 (1.78). Narrowing this to "near 1.586" would flag almost
 * every honest submission and teach the supervisor to ignore the flag — which
 * is worse than not having it. What's left flags the two shapes that really do
 * mean something is wrong: a portrait image (the card rotated or a phone
 * screenshot) and a long thin strip (a crop that lost part of the card).
 */
const MIN_ASPECT = 1.2;
const MAX_ASPECT = 2.2;

/** Below this the number on the card can't be read reliably. */
const MIN_WIDTH = 600;

/** EXIF "Software"/"CreatorTool" values that mean the file went through an editor. */
const EDITOR_PATTERN =
  /photoshop|gimp|canva|paint|picsart|snapseed|lightroom|pixlr|illustrator|inkscape|figma/i;

/**
 * Pulls the Cloudinary public id out of a delivery URL.
 *
 * A secure URL reads
 * `https://res.cloudinary.com/<cloud>/image/upload/v<version>/<folder>/<name>.<ext>`
 * — everything after the version segment, minus the extension, is the id. The
 * version segment is optional in Cloudinary URLs, hence the conditional skip.
 *
 * Returns undefined for anything that isn't one of our Cloudinary URLs, which
 * is also how a pasted third-party link gets rejected.
 */
export function publicIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  let path: string;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return undefined;
    path = parsed.pathname;
  } catch {
    return undefined;
  }

  const segments = path.split("/").filter(Boolean);
  const uploadAt = segments.indexOf("upload");
  if (uploadAt === -1) return undefined;

  let rest = segments.slice(uploadAt + 1);
  if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
  if (rest.length === 0) return undefined;

  const joined = rest.join("/");
  return joined.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * Whether a URL points at a file this user uploaded.
 *
 * Every upload lands in `buildora/<userId>/` (see uploads.controller), so the
 * folder is the owner. Worth checking because `nidFrontUrl` is a plain string
 * on a profile PATCH — without this, anyone could point their NID fields at
 * somebody else's card image and be pre-screened against a stranger's card.
 */
export function isOwnUpload(url: string | undefined, userId: string): boolean {
  const publicId = publicIdFromUrl(url);
  return publicId !== undefined && publicId.startsWith(`buildora/${userId}/`);
}

/** Cloudinary's stored metadata for one asset. Shapes only what's used here. */
interface CloudinaryResource {
  width?: number;
  height?: number;
  image_metadata?: Record<string, string>;
}

/**
 * Reads one card image's metadata from Cloudinary and judges it.
 *
 * Asks Cloudinary rather than trusting numbers from the browser: the file the
 * check describes has to be the file that's actually stored, or the check is
 * decorative. `image_metadata: true` is what makes Cloudinary return the EXIF
 * header alongside the dimensions.
 */
export async function inspectNidImage(
  side: "front" | "back",
  url: string | undefined,
  userId: string
): Promise<NidImageCheck | undefined> {
  if (!url) return undefined;

  if (!isCloudinaryConfigured()) {
    return { side, note: "Image inspection isn't configured" };
  }

  const publicId = publicIdFromUrl(url);
  if (!publicId) {
    return { side, note: "That image isn't hosted here, so it couldn't be inspected" };
  }
  if (!publicId.startsWith(`buildora/${userId}/`)) {
    return { side, note: "That image was uploaded by a different account" };
  }

  let resource: CloudinaryResource;
  try {
    resource = (await cloudinary.api.resource(publicId, {
      image_metadata: true,
    })) as CloudinaryResource;
  } catch (err) {
    // Cloudinary unreachable or the asset is gone — record that we couldn't
    // look, which is not the same as the image being wrong.
    console.error(`[nid] couldn't read image metadata for ${publicId}:`, err);
    return { side, note: "The image couldn't be inspected" };
  }

  const { width, height } = resource;
  const hasSize = typeof width === "number" && typeof height === "number" && height > 0;
  const aspectRatio = hasSize ? Math.round((width / height) * 100) / 100 : undefined;

  // EXIF keys vary by camera and editor; check both the ones that carry an
  // application name. Missing EXIF is normal — screenshots, re-encodes and
  // most upload pipelines drop it — so absence is never reported as a problem.
  const metadata = resource.image_metadata ?? {};
  const software = metadata.Software ?? metadata.CreatorTool ?? "";
  const editorSoftware = EDITOR_PATTERN.test(software) ? software : undefined;

  return {
    side,
    width,
    height,
    aspectRatio,
    aspectOk:
      aspectRatio === undefined ? null : aspectRatio >= MIN_ASPECT && aspectRatio <= MAX_ASPECT,
    resolutionOk: typeof width === "number" ? width >= MIN_WIDTH : null,
    editorSoftware,
  };
}
