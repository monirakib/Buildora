import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design studio",
  description: "Draw floor plans and build the model in 3D.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
