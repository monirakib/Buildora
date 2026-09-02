import type { Metadata } from "next";
import { professionalMetadata } from "@/lib/professionalMeta";

export function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return params.then(({ id }) => professionalMetadata(id, "Contractor"));
}

export default function ContractorsProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
