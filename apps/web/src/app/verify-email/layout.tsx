import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Confirm your email address to receive Buildora notifications.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
