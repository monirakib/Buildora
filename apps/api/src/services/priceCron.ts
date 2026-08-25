import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { runPriceRefresh } from "./priceRefresh";

/**
 * The in-process weekly timer.
 *
 * **Read this before trusting it.** On Render's free tier the instance spins
 * down after roughly fifteen minutes without traffic, and a spun-down process
 * has no timers because it has no process. A weekly schedule on a free instance
 * will therefore almost never fire: the odds of the app happening to be awake at
 * 03:00 on a Monday are poor, and nothing wakes it up on our behalf.
 *
 * So this is the *convenience* trigger, not the guarantee. It earns its place
 * because it costs nothing and it genuinely works in the two places it matters —
 * local development, and any always-on host if this ever moves to one.
 *
 * The guarantee lives elsewhere, in two parts:
 *
 *   - `POST /api/pricing/refresh` with the shared secret, for an external cron
 *     service to call. That request also wakes the instance, which is the point.
 *   - The lazy check in estimator.controller, which refreshes in the background
 *     when someone opens an estimate and the data is overdue.
 *
 * All three funnel into the same idempotent `runPriceRefresh`, so having all
 * three armed at once causes no double work — the second caller sees a run in
 * flight and returns.
 *
 * Set PRICE_REFRESH_CRON=false to disarm this, which is what you want once an
 * external scheduler is doing the job reliably.
 */

/** 03:00 every Monday, Dhaka time. Quiet hours, and a fresh figure for the week. */
const WEEKLY = "0 3 * * 1";
const TIMEZONE = "Asia/Dhaka";

let task: ScheduledTask | null = null;

export function startPriceCron(): void {
  if (!env.PRICE_REFRESH_CRON) {
    console.log("[prices] in-process cron disabled (PRICE_REFRESH_CRON=false)");
    return;
  }
  if (task) return;

  task = cron.schedule(
    WEEKLY,
    () => {
      // Not forced: if an endpoint or lazy trigger already refreshed today, the
      // due check inside runPriceRefresh makes this a no-op.
      void runPriceRefresh({ trigger: "CRON" });
    },
    { timezone: TIMEZONE }
  );

  console.log(`[prices] weekly refresh scheduled (${WEEKLY} ${TIMEZONE})`);
}

/** Stops the timer. Used by tests and by a graceful shutdown. */
export function stopPriceCron(): void {
  task?.stop();
  task = null;
}
