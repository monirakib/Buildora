"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalDetail } from "@/components/professionals/ProfessionalDetail";

export default function ArchitectDetailPage() {
  return <ProfessionalDetail role={UserRole.ARCHITECT} />;
}
