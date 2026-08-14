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
  // The two model providers. services/ai.ts tries Groq first and falls back to
  // Gemini when Groq rate limits or fails, so setting both turns two free tiers
  // into one that survives a demo. Either alone works; with neither, every AI
  // feature 503s with a clear reason and nothing else breaks.
  //
  // Groq — free key, no card, from https://console.groq.com/keys. First choice
  // because it hosts Llama, it's fast, and it's the only one of the two that
  // speaks the OpenAI tool-calling format the assistant's lookups need.
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  // Google Gemini — key from https://aistudio.google.com. The fallback for
  // chat, and the only provider for reading NID cards, since that needs vision.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  // Web Push (VAPID). No account and no third party: generate the pair once
  // with `node -e "console.log(require('web-push').generateVAPIDKeys())"` and
  // paste them here. The subject identifies this server to the push service
  // and must be a mailto: or https: URL. Push is simply off until both are set.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@buildora.software"),
  // Outgoing email has two routes. services/email.ts takes the first one
  // configured, in the order below, and is simply off when neither is.
  //
  // 1. Resend's REST API — free key from https://resend.com (3,000/month,
  //    100/day). The production route: Render's free tier blocks outbound SMTP
  //    ports (25, 465, 587) outright, so a deployed API can reach a mail
  //    service over HTTPS or not at all. Resend needs a domain it has verified
  //    by DNS — ours is buildora.software — and nothing else; no account
  //    review stands between signing up and sending.
  RESEND_API_KEY: z.string().optional(),
  //
  // 2. Gmail over SMTP — no third-party account at all, so it works the moment
  //    an app password exists (Google Account → Security → 2-Step Verification
  //    → App passwords; the normal account password is refused). Unusable on
  //    Render per the port block above, which is why it's the local route and
  //    why it's second. Port 465 is TLS from the first byte, 587 upgrades with
  //    STARTTLS.
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  //
  // The From address, which both routes police differently: Resend accepts any
  // address at a domain it has verified, Gmail only the account that
  // authenticated (it silently rewrites anything else). So this changes to
  // no-reply@buildora.software exactly when RESEND_API_KEY is set, and not
  // before — over SMTP that address would be rewritten straight back.
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
