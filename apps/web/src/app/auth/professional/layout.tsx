import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For professionals",
  description:
    "Join Buildora as a verified architect, structural engineer, contractor, or material supplier.",
};

export default function ProfessionalAuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
