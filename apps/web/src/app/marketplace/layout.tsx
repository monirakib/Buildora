import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Order construction materials from verified suppliers, delivered to your build site.",
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
