import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { UserRole, type PriceRefreshRunSummary } from "@buildora/shared";
import { env } from "../config/env";
import {
  addPriceItem,
  approvePendingPrice,
  downloadPriceSheet,
  getPriceSheet,
  importPriceSheet,
  rejectPendingPrice,
  retirePriceItem,
  sheetUpload,
  updatePriceItem,
} from "../controllers/priceSheet.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { PriceRefreshRun, type PriceRefreshRunDoc } from "../models/PriceRefreshRun";
import { recalculateAllEstimates } from "../services/estimateLadder";
import { isRefreshDue, lastSuccessfulRun, runPriceRefresh } from "../services/priceRefresh";

/**
 * Triggering and inspecting the weekly price refresh.
 *
 * Two ways in, because they serve different callers:
 *
 *   - `POST /api/pricing/refresh` takes a shared secret and no login. This is
 *     for an external cron service — cron-job.org's free tier, or a GitHub
 *     Actions schedule — to ping once a week. It is also what *wakes* a Render
 *     instance that has spun down, which is the entire reason it exists.
 *   - `POST /api/pricing/refresh/admin` and the status route take an admin
 *     session, for a person doing it by hand or checking why prices look stale.
 *
 * `/refresh` does not wait for the run: a scheduler holding a connection open
 * for a scrape and an embedding load would time out on most services and tell
 * us nothing useful anyway, so it returns immediately and the outcome is read
 * back from `/status`. `/refresh/admin` is the exception — see the note on it
 * below for why that one is awaited end to end.
 *
 * The `/sheet` routes underneath are the other half of the module: the weekly
 * price sheet an admin actually maintains by hand, uploaded and downloaded as
 * CSV or edited row by row in the console. They live here rather than under
 * /admin because they are pricing, not administration — everything on this
 * router writes to or reads from the same MarketPrice collection — and they
 * carry the same ADMIN role check either way.
 */
export const pricingRouter = Router();

/**
 * Compares the presented secret in constant time.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are checked
 * first — and that check leaks only the length, which is not the secret. A plain
 * `===` here would leak the secret a character at a time to anyone patient
 * enough to measure the difference.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Shapes a run row for the console — the same fields the status list and the
 * admin trigger's response both need. */
function toRunSummary(
  r: InstanceType<typeof PriceRefreshRun> & PriceRefreshRunDoc
): PriceRefreshRunSummary {
  return {
    id: String(r._id),
    trigger: r.trigger,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString(),
    pricesWritten: r.pricesWritten,
    pricesEmbedded: r.pricesEmbedded,
    estimatesChecked: r.estimatesChecked,
    estimatesUpdated: r.estimatesUpdated,
    sourcesOk: r.sourcesOk,
    sourcesFailed: r.sourcesFailed,
  };
}

/**
 * POST /api/pricing/refresh — for an external scheduler.
 *
 * The secret travels in a header rather than the query string, because query
 * strings end up in access logs and browser history in a way headers do not.
 */
pricingRouter.post("/refresh", async (req: Request, res: Response) => {
  const expected = env.PRICE_REFRESH_SECRET;
  if (!expected) {
    // Refusing outright is deliberate. An endpoint that runs a scrape for
    // anybody who finds it is not something to leave open by default.
    return res.status(503).json({
      error: { message: "Scheduled refresh is not configured (PRICE_REFRESH_SECRET is unset)" },
    });
  }

  const presented = req.get("x-price-refresh-secret") ?? "";
  if (!secretMatches(presented, expected)) {
    return res.status(401).json({ error: { message: "Bad refresh secret" } });
  }

  // The due check is awaited — it is one indexed query — so the response can
  // tell the truth about whether anything actually started. The run itself is
  // not awaited; see the note at the top of the file.
  //
  // This matters more than it looks: a scheduler pinging weekly will often find
  // a refresh already done by the lazy trigger, and answering "started" every
  // time would make the endpoint useless for telling whether it is working.
  const due = await isRefreshDue();
  if (!due) {
    const last = await lastSuccessfulRun();
    return res.status(200).json({
      data: {
        started: false,
        reason: "not due yet",
        lastSuccessfulAt: last?.finishedAt?.toISOString() ?? null,
      },
    });
  }

  void runPriceRefresh({ trigger: "ENDPOINT" });
  return res.status(202).json({ data: { started: true } });
});

/**
 * POST /api/pricing/refresh/admin — "Refresh prices now" in the admin console.
 *
 * Unlike the other two triggers, this one is *awaited* end to end: fetch the
 * latest prices, embed them, then walk every project on the platform and
 * recompute its estimate against them. The other triggers return immediately
 * on purpose — a scheduler or a page load must never be made to wait on a
 * scrape. This one is different because a person just pressed a button and is
 * looking at the screen for the result; making them poll a status page for
 * something they asked for on the spot would be worse UX, not better safety.
 *
 * `force` skips the weekly-interval check: an admin pressing the button has
 * decided it should run now, whatever the schedule says.
 */
pricingRouter.post(
  "/refresh/admin",
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response) => {
    const run = await runPriceRefresh({ trigger: "ADMIN", force: true });
    if (!run) {
      // Only happens when another refresh is already in flight — the in-process
      // guard or a second instance. Recalculating against half-written prices
      // would be worse than telling the admin to wait a moment.
      return res.status(409).json({
        error: { message: "A price refresh is already running — try again shortly" },
      });
    }

    const { checked, updated } = await recalculateAllEstimates();
    run.estimatesChecked = checked;
    run.estimatesUpdated = updated;
    await run.save();

    return res.status(200).json({ data: { run: toRunSummary(run) } });
  }
);

/**
 * GET /api/pricing/status — what the last runs did.
 *
 * The failed-source list is the part worth reading: a parser that broke three
 * weeks ago is invisible everywhere else, because the estimate keeps working
 * perfectly well on the prices it already had.
 */
pricingRouter.get(
  "/status",
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (_req: Request, res: Response) => {
    const [recent, lastGood] = await Promise.all([
      PriceRefreshRun.find().sort({ startedAt: -1 }).limit(10),
      lastSuccessfulRun(),
    ]);

    return res.json({
      data: {
        lastSuccessfulAt: lastGood?.finishedAt?.toISOString() ?? null,
        runs: recent.map(toRunSummary),
      },
    });
  }
);

/* ------------------------------------------------- the weekly price sheet --- */

// Every route below is ADMIN-only. The role check is repeated per route rather
// than applied with router.use, because /refresh above must stay reachable
// without a session for the external scheduler.
const adminOnly = [requireAuth, requireRole(UserRole.ADMIN)] as const;

/** The sheet as JSON, for the console table. */
pricingRouter.get("/sheet", ...adminOnly, getPriceSheet);

/**
 * The sheet as a downloadable CSV.
 *
 * Registered before the parameterised routes and with a literal dot in the
 * path, so it can never be confused with an item id.
 */
pricingRouter.get("/sheet.csv", ...adminOnly, downloadPriceSheet);

// multer parses the multipart body and puts the file on req.file.
pricingRouter.post("/sheet/import", ...adminOnly, sheetUpload.single("sheet"), importPriceSheet);

pricingRouter.post("/sheet/items", ...adminOnly, addPriceItem);
pricingRouter.patch("/sheet/items/:id", ...adminOnly, updatePriceItem);
pricingRouter.post("/sheet/items/:id/retire", ...adminOnly, retirePriceItem);

pricingRouter.post("/sheet/pending/:id/approve", ...adminOnly, approvePendingPrice);
pricingRouter.post("/sheet/pending/:id/reject", ...adminOnly, rejectPendingPrice);
