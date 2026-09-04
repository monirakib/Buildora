"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/store/useSession";
import { VERIFIABLE_ROLES, VerificationWizard } from "@/components/verify/VerificationWizard";
import { ListSkeleton } from "@/components/ui/Skeleton";

/**
 * "Get verified" — one route for every role that can be.
 *
 * Land owners and the four professions all run the same wizard; which steps
 * they see comes from their role (see components/verify/roles.ts). Admins have
 * nothing to submit — they're the ones reviewing — so they're sent to their own
 * console instead.
 */
export default function VerifyPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  // Session lives in localStorage, so render nothing decisive until hydrated.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth");
    } else if (!VERIFIABLE_ROLES.includes(user.role)) {
      router.replace("/supervisor");
    }
  }, [mounted, user, router]);

  if (!mounted || !user || !VERIFIABLE_ROLES.includes(user.role)) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
        <ListSkeleton rows={3} />
      </main>
    );
  }

  return <VerificationWizard user={user} />;
}
