import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orders",
  description: "Track material orders, delivery and payment.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function MarketplaceOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
