import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Broadcasts",
  description: "Send an announcement to a role or to everyone on the platform.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminBroadcastsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
