import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser } from "@buildora/shared";

interface SessionState {
  user: SessionUser | null;
  token: string | null;
  setSession: (user: SessionUser, token: string) => void;
  clearSession: () => void;
}

/**
 * Logged-in user + JWT, persisted to localStorage so the session survives a
 * refresh. Components read `user` to know whether someone is signed in; the
 * token is attached to authenticated API calls.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setSession: (user, token) => set({ user, token }),
      clearSession: () => set({ user: null, token: null }),
    }),
    { name: "buildora-session" }
  )
);
