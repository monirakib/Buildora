"use client";

import { useEffect } from "react";
import { refreshSession } from "@/lib/api";
import { useSession } from "@/store/useSession";

/**
 * How often an open tab renews its access token.
 *
 * Comfortably inside the token's fifteen-minute life, so a tab left open on a
 * dashboard never actually hits an expired token — the 401-and-retry path in
 * lib/api.ts is the safety net for tabs that were asleep, not the normal route.
 */
const RENEW_EVERY_MS = 12 * 60_000;

/**
 * Keeps the browser's login alive.
 *
 * The access token is no longer written to localStorage, so after a reload the
 * app has a remembered `user` but nothing to authenticate with. This is what
 * fills that gap: it trades the httpOnly refresh cookie for a fresh token on
 * load, again every twelve minutes, and again whenever the tab regains focus
 * after being asleep. Each of those also returns the current user, so a role
 * change or a new verification badge lands without a separate poll — which is
 * why the old once-a-minute /me call is gone.
 *
 * Only a definite refusal signs you out. A failed refresh where the cookie is
 * simply absent means nobody was signed in; a network error means the server
 * was unreachable, which is not proof of anything, and `refreshSession`
 * reports both as null — so the decision to clear is made on whether we ever
 * had a user, not on the failure itself.
 */
export function SessionSync() {
  const setBootstrapped = useSession((s) => s.setBootstrapped);
  const clearSession = useSession((s) => s.clearSession);

  useEffect(() => {
    let cancelled = false;

    async function renew() {
      const token = await refreshSession();
      if (cancelled) return;
      if (token) return;

      // No token came back. If we were showing someone as signed in, that
      // belief is now stale — drop it so the UI stops pretending.
      if (useSession.getState().user) clearSession();
      else setBootstrapped();
    }

    // On load, only bother if there is a remembered user. A visitor who has
    // never signed in has no cookie to spend and shouldn't cause a request.
    if (useSession.getState().user) void renew();
    else setBootstrapped();

    const timer = setInterval(renew, RENEW_EVERY_MS);
    const onFocus = () => {
      if (useSession.getState().user) void renew();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [clearSession, setBootstrapped]);

  return null;
}
