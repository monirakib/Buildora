import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open briefs",
  description: "Client project briefs open for proposals, across Bangladesh.",
};

export default function BriefsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
