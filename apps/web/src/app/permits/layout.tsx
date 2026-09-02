import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Permit tools",
  description:
    "Check your plot's DAP zone, estimate RAJUK permit fees, and follow the ECPS application steps.",
};

export default function PermitsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
