"use client";

import { create } from "zustand";
import type { AiChatContext } from "@buildora/shared";

interface AiContextState {
  context: AiChatContext | null;
  setContext: (context: AiChatContext) => void;
  clearContext: () => void;
}

/**
 * What the user is looking at right now, so the Buildora Guide can answer about
 * it instead of answering in general.
 *
 * Deliberately **not** persisted, unlike the session store. This describes the
 * current page, and a copy restored from localStorage would have the assistant
 * confidently discussing a project the user closed yesterday. Not persisting is
 * also why nothing here needs the mount-gate that useSession forces on its
 * readers — there is no hydration step to wait for.
 *
 * It carries ids, not data. The API re-reads every document from MongoDB and
 * re-runs the same permission check the page itself uses, so nothing this store
 * holds can widen what a caller is allowed to see.
 */
export const useAiContext = create<AiContextState>((set) => ({
  context: null,
  setContext: (context) => set({ context }),
  clearContext: () => set({ context: null }),
}));
