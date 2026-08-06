"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@buildora/shared";
import { useSession } from "@/store/useSession";

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/**
 * `/profile` is a signpost rather than a page of its own.
 *
 * Professionals have a real profile — credentials, portfolio, verification —
 * so they go to the professional editor. Land owners and admins don't: their
 * plot details belong to each project brief, and everything personal now lives
 * in account settings, so they go there instead.
 */
export default function ProfileRedirectPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  // The session hydrates from localStorage, so decide only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth");
    } else if (PROFESSIONAL_ROLES.includes(user.role)) {
      router.replace("/profile/professional");
    } else {
      router.replace("/account");
    }
  }, [mounted, user, router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
    </main>
  );
}
