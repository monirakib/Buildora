"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { ArchitectWizard } from "@/components/verify/ArchitectWizard";
import { ClassicProfessionalForm } from "./ClassicForm";

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/**
 * "Complete your profile" — architects get the 10-step verification wizard;
 * the other professional roles keep the classic single-page editor.
 */
export default function ProfessionalProfilePage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  // Session lives in localStorage, so render nothing decisive until hydrated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth/professional");
    } else if (!PROFESSIONAL_ROLES.includes(user.role)) {
      router.replace("/profile");
    }
  }, [mounted, user, router]);

  if (!mounted || !user || !PROFESSIONAL_ROLES.includes(user.role)) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
        <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      </main>
    );
  }

  if (user.role === UserRole.ARCHITECT) {
    return <ArchitectWizard user={user} />;
  }
  return <ClassicProfessionalForm />;
}
