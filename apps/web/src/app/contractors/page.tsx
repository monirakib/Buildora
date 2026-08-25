"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalsDirectory } from "@/components/professionals/ProfessionalsDirectory";

export default function ContractorsPage() {
  return <ProfessionalsDirectory role={UserRole.CONTRACTOR} />;
}
