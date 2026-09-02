import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verification queue",
  description: "Review professional verification requests and issue badges.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
