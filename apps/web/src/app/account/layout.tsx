import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Buildora account, sign-in security, devices and notifications.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
