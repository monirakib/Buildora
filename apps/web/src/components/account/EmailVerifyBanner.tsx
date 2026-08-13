"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { sendVerificationEmail } from "@/lib/api";
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
  const [busy, setBusy] = useState(false);
  // Set once a link has gone out, so the copy switches from "here's why" to
  // "go and look in your inbox".
  const [sent, setSent] = useState(false);

  if (verified) return null;

  async function send() {
    setBusy(true);
    try {
      const { expiresInHours } = await sendVerificationEmail(token);
      setSent(true);
      onToast(`Link sent to ${email} — it's good for ${expiresInHours} hours`, "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't send the link", "error");
    } finally {
      setBusy(false);
    }
  }

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
              and this notice disappears. Nothing in the spam folder either? Send it again in a
              minute.
            </>
          ) : (
            <>
              Until <span className="font-semibold">{email}</span> is confirmed, Buildora sends it
              no email at all — no escrow releases, no meeting confirmations, no verification
              decisions. They&apos;ll still reach you in the app.
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={busy}
        className={`${primaryButtonClass} shrink-0 disabled:opacity-60`}
      >
        {busy ? "Sending…" : sent ? "Send again" : "Send the link"}
      </button>
    </div>
  );
}
