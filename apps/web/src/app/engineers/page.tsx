"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalsDirectory } from "@/components/professionals/ProfessionalsDirectory";

export default function EngineersPage() {
  return <ProfessionalsDirectory role={UserRole.STRUCTURAL_ENGINEER} />;
}
