import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().optional(),
  // Optional override for DNS servers (comma-separated). Needed on networks where
  // Node can't resolve the mongodb+srv SRV records via the default resolver.
  DNS_SERVERS: z.string().optional(),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  // Keep this >= SESSION_MAX_HOURS, or the token dies before the session does.
  JWT_EXPIRES_IN: z.string().default("7d"),
  // How long a login survives with no requests at all, and its hard cap
  // measured from sign-in. Both are enforced in models/Session.ts, so a token
  // that sat unused for a day stops working even though the JWT is still valid.
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(24),
  SESSION_MAX_HOURS: z.coerce.number().positive().default(168), // 7 days
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Cloudinary image hosting (profile photos, certificates, portfolio). All
  // three come from the Cloudinary dashboard; uploads 503 until they're set.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Google Gemini (the Buildora Guide assistant) — key from
  // https://aistudio.google.com; the assistant 503s until it's set.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  // WebRTC ICE servers for voice calls. STUN handles NAT discovery and works
  // for the demo on most networks (defaults to Google's public STUN). Set the
  // TURN_* vars later to relay calls that can't connect peer-to-peer across
  // stricter networks — no client change needed, the API serves these.
  STUN_URLS: z.string().default("stun:stun.l.google.com:19302"),
  TURN_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  // Supervisor account created by `pnpm seed:admin` (see scripts/seed-admin.ts).
  ADMIN_NAME: z.string().default("Platform Supervisor"),
  ADMIN_USERNAME: z.string().default("supervisor"),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse(process.env);
