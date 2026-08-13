"use client";

import { useCallback, useEffect, useState } from "react";
import { MailWarning } from "lucide-react";
import { ApiError, getMe, sendVerificationEmail } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { primaryButtonClass } from "./ui";

/**
 * The nag that sits above every account section until the address is confirmed.
 *
 * Placed outside the tabbed sections on purpose: an unconfirmed address is a
 * property of the whole account, and it silently switches off every email the
 * platform would otherwise send — so it shouldn't be something you only find
 * by picking the right tab.
 *
 * Renders nothing once the address is verified.
 */

/** "4:05", or "45s" under a minute. */
function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(seconds % 60).padStart(2, "0")}`;
}

export function EmailVerifyBanner({
  token,
  email,
  verified,
  onToast,
}: {
  token: string;
  email: string;
  verified: boolean;
  onToast: (message: string, tone?: "success" | "error") => void;
}) {
  const setSession = useSession((s) => s.setSession);

  const [busy, setBusy] = useState(false);
  // Set once a link has gone out, so the copy switches from "here's why" to
  // "go and look in your inbox".
  const [sent, setSent] = useState(false);
  // Seconds left before the button will work. The wait grows with each send,
  // so showing it beats letting someone press a button that only ever fails.
  const [waitLeft, setWaitLeft] = useState(0);

  /**
   * Re-reads the account when this tab comes back to the foreground.
   *
   * The link is nearly always opened somewhere else — the phone holding the
   * mailbox — and confirming it there changes nothing in this browser. Without
   * this, the person returns to a laptop still insisting the address is
   * unconfirmed, and the only cure is a manual reload.
   */
  const refresh = useCallback(async () => {
    try {
      setSession(await getMe(token), token);
    } catch {
      // A failed background refresh isn't worth a message; the banner simply
      // stays until the next attempt.
    }
  }, [token, setSession]);

  useEffect(() => {
    if (verified) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [verified, refresh]);

  // One interval, running only while there's something to count down.
  useEffect(() => {
    if (waitLeft <= 0) return;
    const id = setInterval(() => setWaitLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [waitLeft]);

  if (verified) return null;

  async function send() {
    setBusy(true);
    try {
      const { expiresInHours, nextRetryAfterSeconds } = await sendVerificationEmail(token);
      setSent(true);
      onToast(`Link sent to ${email}, it's good for ${expiresInHours} hours`, "success");
      // The server decides how long the next wait is, and it grows each time.
      setWaitLeft(nextRetryAfterSeconds);
    } catch (err) {
      // A 429 carries how long is still owed, so the button can wait it out
      // rather than inviting another rejected press.
      if (err instanceof ApiError && err.retryAfterSeconds) {
        setWaitLeft(err.retryAfterSeconds);
      }
      onToast(err instanceof Error ? err.message : "Couldn't send the link", "error");
    } finally {
      setBusy(false);
    }
  }

  const waiting = waitLeft > 0;

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-amber-400/50 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/25 text-amber-700 dark:text-amber-300">
        <MailWarning className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
          {sent ? "Check your inbox" : "Confirm your email address"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-700 dark:text-slate-300">
          {sent ? (
            <>
              We sent a confirmation link to <span className="font-semibold">{email}</span>. Open it
              on any device, you don&apos;t need to be signed in there, and this page updates by
              itself when you come back to it.
            </>
          ) : (
            <>
              Until <span className="font-semibold">{email}</span> is confirmed, Buildora sends it
              no email at all, no escrow releases, no meeting confirmations, no verification
              decisions. They&apos;ll still reach you in the app.
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={busy || waiting}
        className={`${primaryButtonClass} shrink-0 disabled:opacity-60`}
      >
        {busy
          ? "Sending…"
          : waiting
            ? `Send again in ${formatCountdown(waitLeft)}`
            : sent
              ? "Send again"
              : "Send the link"}
      </button>
    </div>
  );
}
