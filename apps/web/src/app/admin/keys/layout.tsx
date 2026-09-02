import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Key management",
  description: "Rotate the signing and encryption keys protecting stored data.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminKeysLayout({ children }: { children: React.ReactNode }) {
  return children;
}
