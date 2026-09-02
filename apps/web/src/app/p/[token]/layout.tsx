import type { Metadata } from "next";
import { fetchSharedProgress, shareSummary } from "./share";

/**
 * A share link is usually opened from a preview — someone pastes it into
 * WhatsApp and the family sees a card before anyone taps. Without this they saw
 * the generic site card and no title at all.
 *
 * Everything put in the preview is already on the page behind the link, and the
 * audience is identical (whoever the link reached), so this leaks nothing the
 * share itself doesn't. The address, the money and the names stay out, exactly
 * as publicshare.controller.ts intends.
 *
 * `robots` is the line that matters most: the link's security is that it is
 * unguessable, which is worth nothing if a crawler publishes it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const progress = await fetchSharedProgress(token);

  const noIndex = { index: false, follow: false, nocache: true } as const;

  if (!progress) {
    return {
      title: "Project progress",
      description: "This Buildora share link isn't available.",
      robots: noIndex,
    };
  }

  const title = `${progress.title} — build progress`;
  const description = shareSummary(progress);

  return {
    title,
    description,
    robots: noIndex,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
