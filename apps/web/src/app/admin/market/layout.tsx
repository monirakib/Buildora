import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace moderation",
  description: "Review supplier listings and take down what breaks the rules.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminMarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
