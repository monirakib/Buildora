import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users",
  description: "Search accounts, change roles and suspend abuse.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
