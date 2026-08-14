"use client";

import { useEffect } from "react";
import type { AiChatContext } from "@buildora/shared";
import { useAiContext } from "@/store/useAiContext";

/**
 * Tells the floating assistant what this page is showing, and clears it again
 * when the page unmounts — which is what makes navigating away drop the
 * context, since Next unmounts the old page component on a route change.
 *
 * The descriptor is serialised before it reaches the dependency array so a page
 * can pass a plain object literal, rebuilt on every render, without the effect
 * firing on every render. Both store functions come from Zustand's `set`, whose
 * identity is stable, so they are honest dependencies rather than something to
 * silence the linter over.
 *
 * Pass null while the data is still loading; nothing is registered until there
 * is something to register.
 */
export function useRegisterAiContext(context: AiChatContext | null) {
  const setContext = useAiContext((s) => s.setContext);
  const clearContext = useAiContext((s) => s.clearContext);

  const json = context ? JSON.stringify(context) : null;

  useEffect(() => {
    if (!json) return;
    setContext(JSON.parse(json) as AiChatContext);
    return () => clearContext();
  }, [json, setContext, clearContext]);
}
