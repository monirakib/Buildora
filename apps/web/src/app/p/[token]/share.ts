import type { PublicProgress } from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";

/**
 * Server-side read of a public share link, for the metadata and the OG card.
 *
 * Returns null for anything that isn't a live link — revoked, mistyped, or the
 * API being down. Every caller renders a generic card in that case rather than
 * failing, because a broken link preview is worse than a plain one.
 */
export async function fetchSharedProgress(token: string): Promise<PublicProgress | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/progress/${token}`, {
      // A share link is watched over weeks; a minute of staleness in the
      // preview is fine and keeps a burst of link unfurls off the API.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { progress?: PublicProgress } };
    return body.data?.progress ?? null;
  } catch {
    return null;
  }
}

/** The one-line summary shared by the description and the OG card. */
export function shareSummary(progress: PublicProgress): string {
  const where = progress.areaName ? ` in ${progress.areaName}` : "";
  const floors = progress.floors ? `${progress.floors}-storey ` : "";
  return `Follow the progress of this ${floors}build${where}, tracked on Buildora.`;
}
