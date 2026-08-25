import type { HydratedDocument } from "mongoose";
import { PriceSource as PriceSourceKind, ProductCategory } from "@buildora/shared";
import { MarketPrice } from "../models/MarketPrice";
import { PriceRefreshRun, type PriceRefreshRunDoc } from "../models/PriceRefreshRun";
import { Product } from "../models/Product";
import { RateComposition } from "../models/RateComposition";
import {
  EMBEDDING_MODEL,
  componentEmbeddingText,
  embedBatch,
  priceEmbeddingText,
} from "./embeddings";
import { PRICE_SOURCES, fetchSource } from "./priceSources";

/**
 * The weekly price refresh.
 *
 * ## Why this is not just a cron job
 *
 * The API runs on Render's free tier, which **spins the instance down after
 * about fifteen minutes with no traffic**. An in-process `node-cron` timer stops
 * existing the moment that happens, so a weekly timer on a free instance is not
 * unreliable — it is close to guaranteed never to fire. A project that shipped
 * only `cron.schedule("0 3 * * 1", ...)` would look correct in review and
 * refresh nothing, ever.
 *
 * So there are three triggers into one idempotent function:
 *
 *   1. **CRON** — the in-process weekly timer (services/priceCron). Genuinely
 *      works locally and on any always-on host. Free to keep.
 *   2. **ENDPOINT** — `POST /api/pricing/refresh`, for an external cron service
 *      to ping. This also wakes a sleeping instance, which is the point.
 *   3. **LAZY** — checked when an estimate is read. If a refresh is overdue it
 *      is started in the background and the estimate is served immediately from
 *      what is already stored.
 *
 * The third is the one that actually guarantees freshness, and it is not a
 * novelty here: tenders.controller closes expired tenders the same way, on read,
 * precisely because this codebase has never had a scheduler it could trust.
 *
 * ## Why it is safe to call from anywhere
 *
 * `runPriceRefresh` never throws and never runs twice at once. A second caller
 * arriving mid-run is told a run is already in progress and returns. Individual
 * sources fail independently — a dead scraper marks the run PARTIAL rather than
 * losing the marketplace medians that succeeded.
 */

/** How long a refresh stays fresh. Weekly, as asked. */
const REFRESH_INTERVAL_DAYS = 7;

/** Below this a "median" is one supplier's opinion — the same floor marketDrift uses. */
const MIN_LISTINGS = 3;

/**
 * A run that started but never finished — almost always an instance killed
 * mid-run — stops blocking new runs after this. Without it, one spin-down at an
 * unlucky moment would wedge the refresh permanently.
 */
const STUCK_RUN_MINUTES = 20;

/** In-process guard. Cheap, and catches the common case of two triggers at once. */
let running = false;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** The most recent run that finished cleanly enough to count as a refresh. */
export async function lastSuccessfulRun(): Promise<HydratedDocument<PriceRefreshRunDoc> | null> {
  return PriceRefreshRun.findOne({ status: { $in: ["OK", "PARTIAL"] } }).sort({ finishedAt: -1 });
}

/** True when the last good refresh is older than the weekly interval, or never happened. */
export async function isRefreshDue(): Promise<boolean> {
  const last = await lastSuccessfulRun();
  if (!last?.finishedAt) return true;
  const ageDays = (Date.now() - last.finishedAt.getTime()) / 86_400_000;
  return ageDays >= REFRESH_INTERVAL_DAYS;
}

/**
 * Marketplace medians, written as MarketPrice rows.
 *
 * This is the strongest live source we have and it involves no scraping at all:
 * it is Buildora's own suppliers listing their own prices. No third party's terms
 * apply, nothing can block us, and the data is exactly as current as the
 * marketplace is.
 *
 * One row per category per run. The `itemLabel` says plainly what it is, because
 * "CEMENT — median of 14 listings" is a different kind of claim from "Bashundhara
 * OPC 50kg bag" and an owner reading the provenance deserves to see which.
 */
async function refreshMarketplaceMedians(): Promise<number> {
  const rows = await Product.aggregate<{ _id: string; prices: number[]; units: string[] }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$category",
        prices: { $push: "$priceBdt" },
        units: { $push: "$unit" },
      },
    },
  ]);

  const docs = rows
    .filter((r) => r.prices.length >= MIN_LISTINGS)
    .map((r) => {
      // The most common unit among the listings — a category whose sellers
      // disagree about units would otherwise produce a meaningless median, and
      // this at least records which unit the median belongs to.
      const counts = new Map<string, number>();
      for (const u of r.units) counts.set(u, (counts.get(u) ?? 0) + 1);
      const unit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unit";

      return {
        category: r._id as ProductCategory,
        itemLabel: `${r._id.toLowerCase().replace(/_/g, " ")}, median of ${r.prices.length} Buildora listings`,
        unit,
        priceBdt: Math.round(median(r.prices) * 100) / 100,
        source: PriceSourceKind.MARKETPLACE,
        sourceName: "Buildora marketplace listings",
        // First-party data from our own sellers — there is nothing for an admin
        // to vet that the marketplace's own moderation hasn't already covered.
        approved: true,
        effectiveFrom: new Date(),
      };
    });

  if (docs.length > 0) await MarketPrice.insertMany(docs);
  return docs.length;
}

/**
 * Reads the manufacturer pages. Returns what was written and what failed, rather
 * than throwing — one broken parser must not cost us the rest of the run.
 */
async function refreshScrapedSources(): Promise<{
  written: number;
  ok: string[];
  failed: { source: string; reason: string }[];
}> {
  let written = 0;
  const ok: string[] = [];
  const failed: { source: string; reason: string }[] = [];

  for (const source of PRICE_SOURCES) {
    try {
      const prices = await fetchSource(source);
      if (prices.length === 0) {
        failed.push({ source: source.name, reason: "parsed no rows" });
        continue;
      }

      await MarketPrice.insertMany(
        prices.map((p) => ({
          ...p,
          source: PriceSourceKind.FETCHED,
          sourceName: source.name,
          sourceUrl: source.url,
          // The rule from priceSources: nothing read off a page can move an
          // estimate until a person has looked at it.
          approved: false,
          effectiveFrom: new Date(),
        }))
      );

      written += prices.length;
      ok.push(source.name);
    } catch (err) {
      failed.push({
        source: source.name,
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return { written, ok, failed };
}

/**
 * Gives vectors to everything that needs one.
 *
 * Both sides of the eventual comparison are embedded here, together, which is
 * what keeps the model off the request path entirely (see services/embeddings).
 * Rows embedded by an older model are picked up too, so changing
 * EMBEDDING_MODEL re-embeds the corpus over the next run instead of leaving a
 * mix of incomparable vectors.
 */
async function embedPending(): Promise<number> {
  let embedded = 0;

  // ---- Price labels ----
  const prices = await MarketPrice.find({
    $or: [{ embedding: { $exists: false } }, { embeddingModel: { $ne: EMBEDDING_MODEL } }],
  }).limit(200);

  if (prices.length > 0) {
    const vectors = await embedBatch(
      prices.map((p) => priceEmbeddingText(p.category, p.itemLabel, p.unit))
    );
    await Promise.all(
      prices.map((price, i) => {
        price.embedding = vectors[i]!;
        price.embeddingModel = EMBEDDING_MODEL;
        return price.save();
      })
    );
    embedded += prices.length;
  }

  // ---- Rate-component queries ----
  // Only MATERIAL components get one: labour and fixed slices have nothing to
  // retrieve, so embedding them would be work with no consumer.
  const compositions = await RateComposition.find({
    $or: [
      { componentsEmbeddedWith: { $exists: false } },
      { componentsEmbeddedWith: { $ne: EMBEDDING_MODEL } },
    ],
  }).limit(100);

  for (const composition of compositions) {
    const material = composition.components.filter((c) => c.category);
    if (material.length === 0) {
      composition.componentsEmbeddedWith = EMBEDDING_MODEL;
      await composition.save();
      continue;
    }

    const vectors = await embedBatch(
      material.map((c) => componentEmbeddingText(c.category!, c.label, composition.rateDescription))
    );

    // Written back by position within the filtered list, so the vector lands on
    // the component it was generated from.
    material.forEach((component, i) => {
      component.embedding = vectors[i]!;
    });
    composition.componentsEmbeddedWith = EMBEDDING_MODEL;
    // The components array holds subdocuments; Mongoose does not always see a
    // mutation inside one, so the path is marked by hand.
    composition.markModified("components");
    await composition.save();
    embedded += material.length;
  }

  return embedded;
}

/**
 * Runs a refresh. Never throws.
 *
 * `force` skips the "is it due yet" check — what the admin button and a manual
 * endpoint call use. Everything else respects the weekly interval so that a busy
 * site does not refresh on every request.
 */
export async function runPriceRefresh(opts: {
  trigger: PriceRefreshRunDoc["trigger"];
  force?: boolean;
}): Promise<HydratedDocument<PriceRefreshRunDoc> | null> {
  if (running) {
    console.log("[prices] refresh already running in this process, skipping");
    return null;
  }

  // A second instance, or a run abandoned by a spin-down. The age check is what
  // stops a killed run from wedging this forever.
  const inFlight = await PriceRefreshRun.findOne({ status: "RUNNING" }).sort({ startedAt: -1 });
  if (inFlight) {
    const ageMinutes = (Date.now() - inFlight.startedAt.getTime()) / 60_000;
    if (ageMinutes < STUCK_RUN_MINUTES) {
      console.log("[prices] a refresh is already in flight, skipping");
      return null;
    }
    inFlight.status = "FAILED";
    inFlight.finishedAt = new Date();
    inFlight.sourcesFailed.push({
      source: "run",
      reason: "abandoned, probably an instance restart",
    });
    await inFlight.save();
  }

  if (!opts.force && !(await isRefreshDue())) {
    // Logged rather than returned silently: an operator who pings the endpoint
    // and sees nothing happen deserves to know it was a deliberate no-op and not
    // a failure.
    console.log(`[prices] refresh not due yet, skipping (trigger: ${opts.trigger})`);
    return null;
  }

  running = true;
  const run = await PriceRefreshRun.create({ trigger: opts.trigger, status: "RUNNING" });

  try {
    const marketplaceCount = await refreshMarketplaceMedians();
    const scraped = await refreshScrapedSources();

    // Embedding is last so that a model that fails to load still leaves the
    // freshly written prices in place — they simply match by category until the
    // next run gives them vectors.
    let embedded = 0;
    try {
      embedded = await embedPending();
    } catch (err) {
      scraped.failed.push({
        source: "embeddings",
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }

    run.pricesWritten = marketplaceCount + scraped.written;
    run.pricesEmbedded = embedded;
    run.sourcesOk = [
      ...(marketplaceCount > 0 ? ["Buildora marketplace listings"] : []),
      ...scraped.ok,
    ];
    run.sourcesFailed = scraped.failed;
    run.status = scraped.failed.length > 0 ? "PARTIAL" : "OK";
    run.finishedAt = new Date();
    await run.save();

    console.log(
      `[prices] refresh ${run.status}: ${run.pricesWritten} prices, ${embedded} embedded` +
        (scraped.failed.length ? `, ${scraped.failed.length} source(s) failed` : "")
    );
    return run;
  } catch (err) {
    run.status = "FAILED";
    run.finishedAt = new Date();
    run.sourcesFailed.push({
      source: "run",
      reason: err instanceof Error ? err.message : "unknown error",
    });
    await run.save();
    console.error("[prices] refresh failed:", err instanceof Error ? err.message : err);
    return run;
  } finally {
    running = false;
  }
}

/**
 * Starts a refresh in the background if one is overdue, and returns immediately.
 *
 * This is the lazy trigger, called when an estimate is read. The caller is never
 * made to wait — an owner opening their estimate should not pay for a scrape and
 * a model load, so they get the current stored figure and the *next* reader gets
 * the benefit.
 */
export function refreshInBackgroundIfDue(): void {
  void (async () => {
    try {
      if (await isRefreshDue()) await runPriceRefresh({ trigger: "LAZY" });
    } catch (err) {
      console.error("[prices] lazy refresh failed:", err instanceof Error ? err.message : err);
    }
  })();
}
