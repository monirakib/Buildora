import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

/**
 * Configures the Cloudinary client once, on import.
 *
 * The cloudinary package keeps its credentials in module-level state, so
 * whoever calls `config()` first sets them for everyone. That used to happen as
 * a side effect of importing the uploads controller, which meant any other file
 * calling the API worked only if an upload route had been loaded first. Doing
 * it here makes the dependency something you import on purpose.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/** True when all three keys are present; every caller 503s without them. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

export { cloudinary };
