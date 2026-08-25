"use client";

import { UserRole } from "@buildora/shared";
import { ProfessionalDetail } from "@/components/professionals/ProfessionalDetail";

export default function ContractorDetailPage() {
  return <ProfessionalDetail role={UserRole.CONTRACTOR} />;
}
