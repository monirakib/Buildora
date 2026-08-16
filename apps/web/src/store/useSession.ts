import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser } from "@buildora/shared";

interface SessionState {
  user: SessionUser | null;
  token: string | null;
  /**
   * False until the first refresh attempt after a page load has finished.
   * Lets a screen tell "we don't have a token yet" apart from "nobody is
   * signed in", which look identical otherwise and would flash a signed-out
   * UI on every reload.
   */
  bootstrapped: boolean;
  setSession: (user: SessionUser, token: string) => void;
  /** Replaces just the access token, after a refresh. */
  setToken: (token: string) => void;
  setBootstrapped: () => void;
  clearSession: () => void;
}

/**
 * The signed-in user and their access token.
 *
 * **The token is deliberately not persisted.** It used to be written to
 * localStorage along with the user, which meant any script that ran on the page
 * could read a credential good for seven days — the classic XSS payoff. Now it
 * lives in memory only: a reload drops it, and SessionSync trades the httpOnly
 * refresh cookie for a new one. The cookie is unreadable from JavaScript, so
 * the same XSS bug now yields at most a token that expires in fifteen minutes.
 *
 * `user` is still persisted, and only `user`. It is not a credential — the API
 * never trusts it — and keeping it means a reload paints the signed-in layout
 * immediately instead of flickering through a logged-out state while the
 * refresh call is in flight.
 */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      bootstrapped: false,
      setSession: (user, token) => set({ user, token, bootstrapped: true }),
      setToken: (token) => set({ token, bootstrapped: true }),
      setBootstrapped: () => set({ bootstrapped: true }),
      clearSession: () => set({ user: null, token: null, bootstrapped: true }),
    }),
    {
      name: "buildora-session",
      // Only the user is written to storage. Without this, zustand persists
      // every key in the state — including the token this change exists to
      // keep out of localStorage.
      partialize: (state) => ({ user: state.user }),
    }
  )
);
