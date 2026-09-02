import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project report",
  description: "A printable summary of this project's progress, costs and documents.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function ProjectReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
