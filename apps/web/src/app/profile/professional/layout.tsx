import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Professional profile",
  description: "Your portfolio, credentials and verification status.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function ProfessionalProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
