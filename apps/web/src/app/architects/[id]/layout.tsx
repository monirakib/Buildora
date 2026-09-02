import type { Metadata } from "next";
import { professionalMetadata } from "@/lib/professionalMeta";

export function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return params.then(({ id }) => professionalMetadata(id, "Architect"));
}

export default function ArchitectsProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
