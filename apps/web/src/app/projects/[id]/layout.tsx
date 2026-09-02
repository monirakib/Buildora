import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project",
  description:
    "Your project hub — design, permits, contractor, site diary and documents in one place.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
