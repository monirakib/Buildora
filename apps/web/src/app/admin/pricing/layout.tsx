import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market pricing",
  description: "Approve fetched material prices and run the estimator's refresh.",
  /* An authenticated surface — nothing for a search engine to hold. */
  robots: { index: false, follow: false },
};

export default function AdminPricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
