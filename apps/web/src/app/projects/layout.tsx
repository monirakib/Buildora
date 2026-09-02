import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description: "Every project you own or have been engaged on.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
