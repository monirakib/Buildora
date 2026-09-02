import { Router } from "express";
import mongoose from "mongoose";
import { APP_NAME } from "@buildora/shared";
import { EMBEDDING_MODEL, embeddingModelState } from "../services/embeddings";
import { lastSuccessfulRun } from "../services/priceRefresh";

export const healthRouter = Router();

/** How long the health check will wait on the database before giving up on the
 *  one optional field it reads. */
const PRICE_LOOKUP_TIMEOUT_MS = 2000;

/**
 * GET /api/health — is this deployment alive, and what shape is it in?
 *
 * Three audiences, which is why it reports more than "ok":
 *
 *   - Render polls it to decide whether to restart the service.
 *   - The weekly price-refresh workflow pings it first, to wake a spun-down
 *     free instance before the real request.
 *   - A person looking at a deploy that is misbehaving. That last one is why
 *     the embedding model's state and the last price refresh are here: both
 *     are invisible from outside the process, and both are the usual answer
 *     when estimates look wrong or stale.
 *
 * `status` stays "ok" even when the extras are missing. A degraded integration
 * is not a reason for Render to restart a service that is serving traffic
 * perfectly well.
 */
healthRouter.get("/", async (_req, res) => {
  const connected = mongoose.connection.readyState === 1;

  // One indexed findOne, and only when there is a connection to run it on.
  //
  // Raced against a short deadline rather than simply awaited: the platform
  // reads a hang as "down" and restarts the instance, so a slow cluster must
  // not be able to take the whole service with it over a field that is only
  // informational.
  let lastPriceRefreshAt: string | null = null;
  if (connected) {
    try {
      const run = await Promise.race([
        lastSuccessfulRun(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PRICE_LOOKUP_TIMEOUT_MS)),
      ]);
      lastPriceRefreshAt = run?.finishedAt?.toISOString() ?? null;
    } catch {
      // Leave it null. Not knowing when prices last refreshed is not a reason
      // to report the service as unhealthy.
    }
  }

  const memory = process.memoryUsage();

  res.json({
    status: "ok",
    service: `${APP_NAME} API`,
    database: connected ? "connected" : "disconnected",
    uptime: Math.round(process.uptime()),
    embeddings: {
      model: EMBEDDING_MODEL,
      // Expected to be "unloaded" most of the time: the model is barred from
      // request paths and only the weekly refresh job loads it.
      state: embeddingModelState(),
    },
    prices: { lastRefreshAt: lastPriceRefreshAt },
    // Reported in MB because the number that matters is the 512 MB ceiling on
    // the free instance, and the model alone peaks around 274 MB of it.
    memoryMb: {
      rss: Math.round(memory.rss / 1_048_576),
      heapUsed: Math.round(memory.heapUsed / 1_048_576),
    },
  });
});
