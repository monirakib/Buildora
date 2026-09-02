import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meetings",
  description: "Book and manage consultations with the professionals on your project.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function MeetingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
