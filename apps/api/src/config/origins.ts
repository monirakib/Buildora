import { env } from "./env";

/**
 * The web origins allowed to call this API with credentials.
 *
 * CORS_ORIGIN was a single value; it is now a comma-separated list, because a
 * deployed setup realistically has more than one — the production site, a
 * preview deployment, localhost while developing against the live API. Existing
 * single-value configurations keep working unchanged.
 *
 * This list is load-bearing in two places, not one: it decides who CORS lets
 * talk to us, and it is the allowlist the CSRF guard checks the Origin header
 * against. Both consult the same array so they cannot drift apart.
 */
export const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
