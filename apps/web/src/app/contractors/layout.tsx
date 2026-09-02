import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contractors",
  description:
    "Browse verified construction contractors in Bangladesh — past work, ratings and reviews.",
};

export default function ContractorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
