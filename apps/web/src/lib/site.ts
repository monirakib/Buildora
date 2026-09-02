/**
 * Where this deployment lives, as an absolute origin.
 *
 * Metadata needs this and cannot guess it: an OG image or a canonical URL is
 * read by a crawler on someone else's machine, so a relative path is useless.
 * Getting it wrong doesn't error — it just silently ships link previews that
 * point at the wrong host, which is why the fallback chain is explicit.
 *
 *   1. NEXT_PUBLIC_SITE_URL — set this in production, it always wins.
 *   2. NEXT_PUBLIC_VERCEL_URL — what Vercel injects for preview deployments,
 *      hostname only, so the scheme has to be added back.
 *   3. localhost, for development.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

/** An absolute URL for `path`, for metadata that cannot take a relative one. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
