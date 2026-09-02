import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sell materials",
  description: "List your products and manage stock as a verified supplier.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function MarketplaceSellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
