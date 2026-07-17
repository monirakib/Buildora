"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The professional signup now lives on the unified /auth page (third pane of
 * the toggle). This route sticks around so old links and redirects keep
 * working — it just forwards there.
 */
export default function ProfessionalAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/auth?role=professional");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
      <p className="text-sm text-stone-500 dark:text-slate-500">Redirecting…</p>
    </main>
  );
}
