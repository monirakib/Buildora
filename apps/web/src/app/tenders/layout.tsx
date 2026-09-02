import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tenders",
  description: "Open Bills of Quantities accepting sealed contractor bids.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function TendersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
