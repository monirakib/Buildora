"use client";

import { useEffect, useState } from "react";
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
        onUnavailable?.(!c.configured);
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
        className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {busy ? "Opening checkout…" : (label ?? `Pay ${formatBdt(amountBdt)} online`)}
      </button>
      <p className="mt-1.5 text-xs text-stone-600 dark:text-slate-400">
        bKash, Nagad, Rocket, card or internet banking via SSLCommerz
        {sandbox ? " · test mode, no real money moves" : ""}.
      </p>
      {error && (
        <p className="mt-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
