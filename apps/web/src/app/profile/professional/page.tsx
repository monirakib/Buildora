"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ListSkeleton } from "@/components/ui/Skeleton";

/**
 * The wizard used to live here, back when only professionals had one. Land
 * owners are verified through the same flow now, so it moved to `/verify`.
 *
 * This redirect stays because the path is baked into approval and rejection
 * notifications already sitting in people's inboxes and notification bells —
 * see verification.controller.ts.
 */
export default function ProfessionalProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/verify");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 dark:bg-[#05070C]">
      <ListSkeleton rows={3} />
    </main>
  );
}
