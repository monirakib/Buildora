import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Permit data",
  description: "Edit DAP zones, RAJUK fee rules and the ECPS step sequence.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminPermitsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
