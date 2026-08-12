"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { SSLCOMMERZ_MAX_BDT, type PaymentPurpose } from "@buildora/shared";
import { getPaymentConfig, startCheckout } from "@/lib/apiPayments";
import { formatBdt } from "@/components/app/projectStatus";

/**
 * "Pay online" — opens an SSLCommerz checkout for one payable thing.
 *
 * Renders nothing at all when the server has no store credentials, which is
 * what lets every payment screen keep its manual sandbox form as a fallback:
 * the gateway button appears when it can work, and simply isn't there when it
 * can't. Callers pass `children` for the fallback ordering, but this component
 * never disables anything else.
 *
 * The redirect is a full page navigation, not a fetch — the payer has to see
 * and interact with SSLCommerz's own page, where they pick bKash, Nagad,
 * Rocket, a card or internet banking. No payment credential ever reaches us.
 */
export function GatewayPayButton({
  token,
  purpose,
  refId,
  amountBdt,
  label,
  onUnavailable,
}: {
  token: string;
  purpose: PaymentPurpose;
  refId: string;
  /** Only for the button text — the server decides what's actually charged. */
  amountBdt: number;
  label?: string;
  /** Told whether the gateway is usable, so the caller can show its fallback. */
  onUnavailable?: (unavailable: boolean) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPaymentConfig()
      .then((c) => {
        if (!active) return;
        setConfigured(c.configured);
        setSandbox(c.sandbox);
        // "Unavailable" covers both having no store keys and this particular
        // amount being over the gateway's per-transaction ceiling. Callers hide
        // their manual form when the gateway can pay, so an over-limit payment
        // has to count as unavailable or there would be no way to settle it.
        onUnavailable?.(!c.configured || amountBdt > SSLCOMMERZ_MAX_BDT);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(false);
        onUnavailable?.(true);
      });
    return () => {
      active = false;
    };
    // onUnavailable is a fresh closure each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (configured !== true) return null;

  // Above the gateway's per-transaction ceiling there's no point offering it.
  if (amountBdt > SSLCOMMERZ_MAX_BDT) {
    return (
      <p className="mt-2 text-xs text-stone-600 dark:text-slate-400">
        This is over the {formatBdt(SSLCOMMERZ_MAX_BDT)} limit for a single online payment — settle
        it by bank transfer and record it below.
      </p>
    );
  }

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      const { gatewayUrl } = await startCheckout(token, purpose, refId);
      window.location.href = gatewayUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the payment page");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handlePay}
        disabled={busy}
        className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-400 hover:shadow-emerald-500/40 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 sm:w-auto dark:focus-visible:ring-offset-stone-950"
      >
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span>{busy ? "Opening checkout…" : (label ?? `Pay ${formatBdt(amountBdt)} online`)}</span>
        {/* Nudges on hover to signal this leaves the page for SSLCommerz. */}
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>

      {/* The channels, as chips rather than a sentence — a payer scanning for
          "is bKash here?" finds it faster than in prose. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {["bKash", "Nagad", "Rocket", "Card", "Net banking"].map((channel) => (
          <span
            key={channel}
            className="rounded-full border border-stone-300/70 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600 dark:border-white/15 dark:text-slate-400"
          >
            {channel}
          </span>
        ))}
        {sandbox && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            Test mode — no real money
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
