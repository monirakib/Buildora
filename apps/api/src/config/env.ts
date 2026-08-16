import "dotenv/config";
import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * The signing secret used when none is configured. Fine for local development,
 * catastrophic in production — it is published in this repository, so anyone
 * could mint a token claiming any user id and any role. The guard below refuses
 * to start on it outside development.
 */
const DEV_JWT_SECRET = "dev-secret-change-me";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().optional(),
  // Optional override for DNS servers (comma-separated). Needed on networks where
  // Node can't resolve the mongodb+srv SRV records via the default resolver.
  DNS_SERVERS: z.string().optional(),
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  // How long an access token is good for. Short on purpose: it travels in a
  // header and lives in the browser's memory, so the realistic question is not
  // "can it be stolen" but "how long is a stolen one worth anything". Fifteen
  // minutes. The refresh cookie is what keeps someone signed in for a week.
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  // Refresh-token signing keys, as JSON: {"v1":"<base64, >=32 bytes>"}.
  // Optional — when unset, a key is derived from JWT_SECRET with a domain
  // separator (see refreshKeys below), so there is nothing extra to configure
  // to get started. Phase 4 replaces this with a rotatable keyring.
  REFRESH_HMAC_KEYRING: z.string().optional(),
  REFRESH_KEY_ACTIVE: z.string().default("v1"),
  // Cookie policy for the refresh token. Left unset these follow NODE_ENV:
  // SameSite=Strict locally, SameSite=None in production.
  //
  // None is not a downgrade here, it is the only value that works: the web app
  // and this API are served from different registrable domains, and a browser
  // will not send a Strict or Lax cookie on a request to a different site. A
  // Strict cookie would work perfectly on localhost and silently sign everyone
  // out the moment it deployed. Because None means the cookie *is* sent
  // cross-site, /auth/refresh and /auth/logout carry a CSRF guard —
  // see middleware/csrf.ts.
  SESSION_COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).optional(),
  // Set only if the API and web app share a registrable domain and the cookie
  // should span subdomains (e.g. ".buildora.software"). Leave unset otherwise;
  // a wrong value means the browser drops the cookie without saying why.
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  // Ed25519 private keys that SIGN access tokens, as JSON: {"k1":"<PKCS#8 PEM>"}.
  // Required in production; a throwaway pair is generated in development, so
  // restarts sign you out locally. The public halves are served at
  // /api/auth/jwks — see services/jwt.ts for why the signing is asymmetric.
  //   node -e "const{generateKeyPairSync}=require('crypto');const{privateKey}=generateKeyPairSync('ed25519');console.log(JSON.stringify({k1:privateKey.export({type:'pkcs8',format:'pem'})}))"
  JWT_KEYRING: z.string().optional(),
  // Field-encryption keys, as JSON: {"k1":"<base64, exactly 32 bytes>"}.
  //
  // REQUIRED IN PRODUCTION, and unlike the refresh keys it is deliberately NOT
  // derived from JWT_SECRET. A derived key would mean rotating JWT_SECRET — an
  // ordinary, encouraged thing to do — silently made every encrypted NID and
  // bank number permanently unreadable. Encryption keys must outlive the
  // secrets around them, so this one is given, not computed. Back it up: lose
  // it and the encrypted fields are unrecoverable, by design.
  DATA_KEYRING: z.string().optional(),
  DATA_KEY_ACTIVE: z.string().default("k1"),
  // Keys the blind index and the ledger integrity tags are computed with, same
  // JSON shape. Both fall back to a value derived from the data key, so there
  // is one thing to configure rather than three.
  BLIND_INDEX_KEYRING: z.string().optional(),
  LEDGER_HMAC_KEYRING: z.string().optional(),
  LEDGER_KEY_ACTIVE: z.string().default("k1"),
  // argon2id cost, used by services/password.ts. The defaults are OWASP's
  // second recommended configuration (19 MiB, 2 passes, 1 lane) — chosen over
  // the 64 MiB one because this API runs on a 512 MB Render instance. Raise
  // ARGON2_MEMORY_KIB if it ever moves somewhere roomier; existing hashes keep
  // working and are upgraded to the new cost as people sign in.
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
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
  // Key-management account created by `pnpm seed:superadmin`. Separate from the
  // supervisor above on purpose — see UserRole.SUPER_ADMIN.
  SUPER_ADMIN_NAME: z.string().default("Key Custodian"),
  SUPER_ADMIN_USERNAME: z.string().default("keycustodian"),
  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
});

const parsedEnv = envSchema.parse(process.env);

/**
 * The refresh-token signing keys, keyed by version.
 *
 * With no keyring configured, one key is *derived* from JWT_SECRET rather than
 * reused from it. The domain separator in the HMAC below is what makes that
 * safe: it produces a value that cannot be worked backwards into JWT_SECRET and
 * shares nothing with the key used to sign access tokens, so a weakness in one
 * use doesn't become a weakness in the other. Reusing one secret for two
 * different jobs is the mistake this avoids, and it costs nothing to deploy.
 */
function refreshKeys(cfg: z.infer<typeof envSchema>): Record<string, Buffer> {
  if (!cfg.REFRESH_HMAC_KEYRING) {
    const derived = createHmac("sha256", cfg.JWT_SECRET)
      .update("buildora/refresh-token/v1")
      .digest();
    return { v1: derived };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(cfg.REFRESH_HMAC_KEYRING);
  } catch {
    throw new Error('REFRESH_HMAC_KEYRING must be JSON, e.g. {"v1":"<base64 key>"}');
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error('REFRESH_HMAC_KEYRING must be a JSON object, e.g. {"v1":"<base64 key>"}');
  }

  const keys: Record<string, Buffer> = {};
  for (const [version, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`REFRESH_HMAC_KEYRING["${version}"] must be a base64 string`);
    }
    const key = Buffer.from(value, "base64");
    if (key.length < 32) {
      throw new Error(
        `REFRESH_HMAC_KEYRING["${version}"] must decode to at least 32 bytes (got ${key.length})`
      );
    }
    keys[version] = key;
  }
  return keys;
}

/**
 * Parses a JSON keyring into buffers, checking every key is long enough.
 *
 * `exactLength` is set for AES-256, which takes a 256-bit key and nothing else;
 * HMAC accepts any length, so those only have a floor.
 */
function parseKeyring(
  name: string,
  raw: string,
  { exactLength }: { exactLength?: number } = {}
): Record<string, Buffer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be JSON, e.g. {"k1":"<base64 key>"}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object, e.g. {"k1":"<base64 key>"}`);
  }

  const keys: Record<string, Buffer> = {};
  for (const [version, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") throw new Error(`${name}["${version}"] must be a base64 string`);
    const key = Buffer.from(value, "base64");
    if (exactLength && key.length !== exactLength) {
      throw new Error(
        `${name}["${version}"] must decode to exactly ${exactLength} bytes (got ${key.length}). ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(${exactLength}).toString('base64'))"`
      );
    }
    if (!exactLength && key.length < 32) {
      throw new Error(`${name}["${version}"] must decode to at least 32 bytes (got ${key.length})`);
    }
    keys[version] = key;
  }
  return keys;
}

/**
 * The field-encryption keys.
 *
 * In production a keyring must be supplied; there is no safe default, because
 * anything we could invent would either be guessable or tied to a secret people
 * rotate. In development one is derived so the app runs with no setup — with
 * the warning that matters attached, since changing JWT_SECRET locally will
 * orphan anything already encrypted.
 */
function dataKeys(cfg: z.infer<typeof envSchema>): Record<string, Buffer> {
  if (cfg.DATA_KEYRING) return parseKeyring("DATA_KEYRING", cfg.DATA_KEYRING, { exactLength: 32 });

  if (cfg.NODE_ENV === "production") {
    throw new Error(
      "DATA_KEYRING is required in production — NID numbers and bank details are encrypted with it. " +
        "Generate one with: node -e \"console.log(JSON.stringify({k1:require('crypto').randomBytes(32).toString('base64')}))\" " +
        "and keep a copy somewhere safe: lose it and the encrypted fields are unrecoverable."
    );
  }

  console.warn(
    "[api] DATA_KEYRING is not set — deriving a development key from JWT_SECRET. " +
      "Changing JWT_SECRET will make locally encrypted data unreadable."
  );
  return {
    k1: createHmac("sha256", cfg.JWT_SECRET).update("buildora/field-encryption/k1").digest(),
  };
}

const REFRESH_HMAC_KEYS = refreshKeys(parsedEnv);
const DATA_KEYS = dataKeys(parsedEnv);
if (!DATA_KEYS[parsedEnv.DATA_KEY_ACTIVE]) {
  throw new Error(
    `DATA_KEY_ACTIVE is "${parsedEnv.DATA_KEY_ACTIVE}" but DATA_KEYRING has no such key.`
  );
}

/**
 * The blind-index and ledger keys, each derived from the active data key unless
 * given explicitly. Domain separators keep them independent: knowing one tells
 * you nothing about the others, so the same keyring can back three jobs without
 * one job's weakness becoming another's.
 *
 * Note the blind-index key is deliberately a single value rather than a
 * versioned ring. Rotating it means recomputing every index entry from
 * plaintext while the unique constraint must continue to hold, which is not an
 * online operation — see the phase 4 notes before ever changing it.
 */
const BLIND_INDEX_KEY = parsedEnv.BLIND_INDEX_KEYRING
  ? Object.values(parseKeyring("BLIND_INDEX_KEYRING", parsedEnv.BLIND_INDEX_KEYRING))[0]!
  : createHmac("sha256", DATA_KEYS[parsedEnv.DATA_KEY_ACTIVE]!)
      .update("buildora/blind-index/v1")
      .digest();

const LEDGER_KEYS = parsedEnv.LEDGER_HMAC_KEYRING
  ? parseKeyring("LEDGER_HMAC_KEYRING", parsedEnv.LEDGER_HMAC_KEYRING)
  : {
      k1: createHmac("sha256", DATA_KEYS[parsedEnv.DATA_KEY_ACTIVE]!)
        .update("buildora/ledger-integrity/k1")
        .digest(),
    };
if (!LEDGER_KEYS[parsedEnv.LEDGER_KEY_ACTIVE]) {
  throw new Error(
    `LEDGER_KEY_ACTIVE is "${parsedEnv.LEDGER_KEY_ACTIVE}" but LEDGER_HMAC_KEYRING has no such key.`
  );
}
if (!REFRESH_HMAC_KEYS[parsedEnv.REFRESH_KEY_ACTIVE]) {
  throw new Error(
    `REFRESH_KEY_ACTIVE is "${parsedEnv.REFRESH_KEY_ACTIVE}" but REFRESH_HMAC_KEYRING has no such key.`
  );
}

export const env = {
  ...parsedEnv,
  REFRESH_HMAC_KEYS,
  DATA_KEYS,
  BLIND_INDEX_KEY,
  LEDGER_KEYS,
  /**
   * Strict locally so development matches the textbook answer, None in
   * production because the deployed web app is on a different site and a Strict
   * cookie would never be sent. See the note on SESSION_COOKIE_SAMESITE above.
   */
  SESSION_COOKIE_SAMESITE:
    parsedEnv.SESSION_COOKIE_SAMESITE ??
    ((parsedEnv.NODE_ENV === "production" ? "none" : "strict") as "none" | "strict"),
};

/**
 * Refuse to run a deployment on a forgeable token secret.
 *
 * This is a crash rather than a warning on purpose. An API that boots with the
 * repo's default secret looks completely healthy — every login works, every
 * page loads — while anyone who has read this file can sign a token claiming
 * `role: "ADMIN"` and be believed. Failing to start is loud; running is silent.
 *
 * 32 characters is the floor because the tokens are signed with HMAC-SHA256,
 * whose security tops out at the length of its key: a short secret is brute
 * forceable offline from a single captured token.
 */
if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is still the development default. Set a real one before deploying — " +
        "generate it with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error(`JWT_SECRET must be at least 32 characters (got ${env.JWT_SECRET.length}).`);
  }
} else if (env.JWT_SECRET === DEV_JWT_SECRET) {
  console.warn(
    "[api] Using the default JWT_SECRET. Fine locally; this will not start in production."
  );
}
