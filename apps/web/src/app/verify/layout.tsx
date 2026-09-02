import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get verified",
  description: "Submit your identity and credentials for supervisor review.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
