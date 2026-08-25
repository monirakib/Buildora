"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalDetail } from "@/components/professionals/ProfessionalDetail";

export default function EngineerDetailPage() {
  return <ProfessionalDetail role={UserRole.STRUCTURAL_ENGINEER} />;
}
