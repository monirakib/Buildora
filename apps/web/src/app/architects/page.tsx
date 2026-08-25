"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalsDirectory } from "@/components/professionals/ProfessionalsDirectory";

export default function ArchitectsPage() {
  return <ProfessionalsDirectory role={UserRole.ARCHITECT} />;
}
