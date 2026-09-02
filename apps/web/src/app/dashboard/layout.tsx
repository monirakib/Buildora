import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your projects, messages, requests and next steps.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
