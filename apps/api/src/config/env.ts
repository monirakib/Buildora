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
  // Where the browser lives, and where this API is reachable. SSLCommerz sends
  // the payer's browser back to the API (a POST it signs), and the API then
  // redirects them into the web app — so both URLs have to be known.
  WEB_BASE_URL: z.string().default("http://localhost:3000"),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  // SSLCommerz payment gateway — one checkout page fronting bKash, Nagad,
  // Rocket, cards and internet banking. Register a free sandbox store at
  // https://developer.sslcommerz.com to get these; payments fall back to
  // manual sandbox entry until they're set. Keep SSLCZ_SANDBOX=true until you
  // hold live merchant credentials, or real money will move.
  SSLCZ_STORE_ID: z.string().optional(),
  SSLCZ_STORE_PASSWORD: z.string().optional(),
  SSLCZ_SANDBOX: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  // Cloudinary image hosting (profile photos, certificates, portfolio). All
  // three come from the Cloudinary dashboard; uploads 503 until they're set.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Google Gemini (the Buildora Guide assistant) — key from
  // https://aistudio.google.com; the assistant 503s until it's set.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  // Web Push (VAPID). No account and no third party: generate the pair once
  // with `node -e "console.log(require('web-push').generateVAPIDKeys())"` and
  // paste them here. The subject identifies this server to the push service
  // and must be a mailto: or https: URL. Push is simply off until both are set.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@buildora.local"),
  // Outgoing email over plain SMTP, from a mailbox we already own — no email
  // provider account, no API key. The defaults are Gmail's servers: put the
  // sending address in SMTP_USER and a 16-character **app password** in
  // SMTP_PASSWORD (Google Account → Security → 2-Step Verification → App
  // passwords). The normal account password will not work; Google stopped
  // accepting it for SMTP in 2022. Use port 465 (TLS) or 587 (STARTTLS).
  // Email is off until both SMTP_USER and SMTP_PASSWORD are set.
  //
  // EMAIL_FROM_ADDRESS defaults to SMTP_USER, and with Gmail it has to *be*
  // SMTP_USER or one of its verified aliases — Gmail rewrites any other From.
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default("Buildora"),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  // OpenRouteService — driving distance and ETA from a supplier's warehouse to
  // the build site. Free key from https://openrouteservice.org; delivery
  // estimates are hidden until it's set. Note ORS takes coordinates lng-first.
  ORS_API_KEY: z.string().optional(),
  // OpenStreetMap's Nominatim geocoder — powers the plot map picker's search
  // box and the address lookup for a dropped pin. Free and keyless, but its
  // usage policy wants an identifying User-Agent with a contact address and at
  // most one request a second, both of which geo.controller.ts handles.
  // Put a real email or repo URL in NOMINATIM_CONTACT: Nominatim blocks any
  // User-Agent carrying a placeholder domain like example.com outright (403).
  NOMINATIM_BASE_URL: z.string().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_CONTACT: z.string().default("buildora-cse471"),
  // Open-Meteo — the weather stamped onto every site diary entry, and the
  // forecast strip above it. Free with no API key and no signup at all, so
  // there is nothing to configure; these exist only so the host can be pointed
  // elsewhere. Two hosts because they are genuinely separate services: the
  // forecast API covers roughly the last 92 days plus 16 ahead from a live
  // model, and the archive API serves older dates from reanalysis data.
  OPEN_METEO_FORECAST_URL: z.string().default("https://api.open-meteo.com/v1/forecast"),
  OPEN_METEO_ARCHIVE_URL: z.string().default("https://archive-api.open-meteo.com/v1/archive"),
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
