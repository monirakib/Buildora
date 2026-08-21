"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import { useSession } from "@/store/useSession";

/**
 * The BD Design Studio, on its own route.
 *
 * It gets a route of its own rather than a panel inside the project page for a
 * plain reason: it is a viewport-filling tool. Its top bar, tool rail, twin
 * canvases, properties panel and status bar are laid out against `100vh` and
 * expect to be the only thing on screen. Dropping that into a tabbed page under
 * a site header would have meant redesigning it, which is the one thing this
 * was not supposed to do.
 *
 * The page itself does almost nothing — check there is a session, then mount
 * the studio. Everything else, including who may edit and what has been drawn,
 * is settled by the API when `StudioShell` loads the design.
 */
export default function ProjectStudioPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);

  // The session is restored from a refresh cookie after hydration, so the first
  // client render legitimately has no token. Waiting a tick avoids bouncing a
  // signed-in architect to /auth on every hard refresh of this page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!token || !user) router.replace("/auth");
  }, [mounted, token, user, router]);

  if (!mounted || !token || !user) {
    return <p className="p-10 text-center text-sm text-stone-500">Loading…</p>;
  }

  return <StudioShell projectId={params.id} />;
}
