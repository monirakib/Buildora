"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/store/useSession";
import { PROFESSIONAL_ROLES, ProfessionalWizard } from "@/components/verify/ProfessionalWizard";

/**
 * "Complete your profile" — every professional role runs the verification
 * wizard. Which steps they see comes from their role; see components/verify/roles.ts.
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
      router.replace("/auth?role=professional");
    } else if (!PROFESSIONAL_ROLES.includes(user.role)) {
      router.replace("/account");
    }
  }, [mounted, user, router]);

  if (!mounted || !user || !PROFESSIONAL_ROLES.includes(user.role)) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
        <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      </main>
    );
  }

  return <ProfessionalWizard user={user} />;
}
