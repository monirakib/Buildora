import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post a brief",
  description: "Describe your plot and what you want to build, and start receiving proposals.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function NewProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
