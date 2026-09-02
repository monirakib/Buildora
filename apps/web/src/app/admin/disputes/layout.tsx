import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disputes",
  description: "Review and rule on escrow and order disputes.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminDisputesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
