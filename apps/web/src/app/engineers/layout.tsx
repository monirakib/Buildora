import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Structural engineers",
  description:
    "Browse verified structural and civil engineers in Bangladesh — credentials, ratings and reviews.",
};

export default function EngineersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
