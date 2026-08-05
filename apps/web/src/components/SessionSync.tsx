"use client";

import { useEffect } from "react";
import { ApiError, getMe } from "@/lib/api";
import { useSession } from "@/store/useSession";

/** How often an open tab re-checks that its login is still good. */
const CHECK_EVERY_MS = 60_000;

/**
 * Keeps the browser's stored login honest.
 *
 * The token sits in localStorage so a refresh doesn't sign you out — but on its
 * own that means the UI still looks signed in long after the server has expired
 * the session, and you'd only find out when some API call failed. This asks the
 * API who we are on load, whenever the tab regains focus, and once a minute,
 * and drops the stored session the moment the API stops accepting the token.
 *
 * Only a 401 signs you out. A network error (API down, laptop offline) leaves
 * the session alone — being unable to reach the server isn't proof of anything.
 */
export function SessionSync() {
  const token = useSession((s) => s.token);
  const setSession = useSession((s) => s.setSession);
  const clearSession = useSession((s) => s.clearSession);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function check() {
      try {
        const user = await getMe(token!);
        if (cancelled) return;
        // Refresh the cached user too, so a role change or a new verification
        // badge shows up without signing out. Only write when it actually
        // differs, to avoid re-rendering every subscriber each minute.
        const current = useSession.getState().user;
        if (JSON.stringify(current) !== JSON.stringify(user)) setSession(user, token!);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) clearSession();
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [token, setSession, clearSession]);

  return null;
}
