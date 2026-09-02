import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Architects",
  description:
    "Browse verified architects in Bangladesh — portfolios, ratings and reviews, filterable by division and district.",
};

export default function ArchitectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
