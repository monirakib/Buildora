import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requests",
  description: "Contact requests between land owners and professionals.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function InquiriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
