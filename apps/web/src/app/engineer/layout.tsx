import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engineer console",
  description: "Inspections waiting on your signature, drawing sets due, and your escrow.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function EngineerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
