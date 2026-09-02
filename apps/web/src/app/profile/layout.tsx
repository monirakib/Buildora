import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your public profile.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
