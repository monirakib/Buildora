import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tender",
  description: "A Bill of Quantities open for sealed contractor bids.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function TenderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
