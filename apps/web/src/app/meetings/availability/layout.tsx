import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your availability",
  description: "Set the hours clients can book you for.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function MeetingsAvailabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
