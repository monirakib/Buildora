import type { Metadata } from "next";
import { professionalMetadata } from "@/lib/professionalMeta";

export function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return params.then(({ id }) => professionalMetadata(id, "Structural engineer"));
}

export default function EngineersProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
