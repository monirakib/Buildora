import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import multer from "multer";
import { z } from "zod";
import { PriceSource, ProductCategory, type PriceSheetImportReport } from "@buildora/shared";
import { MarketPrice } from "../models/MarketPrice";
import { PriceRefreshRun } from "../models/PriceRefreshRun";
import { recalculateAllEstimates } from "../services/estimateLadder";
import { embedPending } from "../services/priceRefresh";
import {
  applyPriceSheet,
  currentSheet,
  emptyImportReport,
  OWN_SOURCE_NAME,
  parsePriceSheet,
  pendingPrices,
  serializePriceSheet,
} from "../services/priceSheet";
import { safeIssues } from "../utils/validation";

/**
 * The admin's price sheet — the surface behind /admin/pricing.
 *
 * Everything here is ADMIN-only (see routes/pricing.routes.ts) and everything
 * here writes, at most, a new row. There is no update and no delete on this
 * controller by design: MarketPrice is append-only because an estimate from
 * March has to still be explainable in August, and a console that could edit a
 * price in place would quietly destroy that. "Change the price of cement" means
 * "write today's cement price"; "remove this item" means "write a row saying it
 * is retired".
 *
 * The one thing these routes deliberately do *not* do is reprice existing
 * estimates. A single price correction walking every project on the platform
 * would make a one-field edit take a minute for no good reason. The CSV import
 * does reprice, because that is the weekly ritual and the admin is expecting it
 * to be the moment everything moves; a one-off correction is followed by the
 * "Refresh prices now" button when the admin wants it applied.
 */

/**
 * The uploaded sheet. 1 MB is roughly twenty thousand rows — far more than a
 * hand-maintained sheet will ever hold, and small enough that holding it in
 * memory costs nothing on a 512 MB instance.
 */
export const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Browsers are inconsistent about the CSV mime type — Windows reports
    // application/vnd.ms-excel for a .csv when Excel is installed — so the
    // extension is the reliable signal and the mime types are a courtesy.
    const looksLikeCsv =
      /\.csv$/i.test(file.originalname) ||
      ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.mimetype);
    if (looksLikeCsv) return cb(null, true);
    cb(new Error("Upload a .csv file"));
  },
});

/* ---------------------------------------------------------------- reads --- */

/** GET /api/pricing/sheet — the live sheet plus anything awaiting review. */
export async function getPriceSheet(_req: Request, res: Response) {
  const [items, pending] = await Promise.all([currentSheet(), pendingPrices()]);
  return res.json({ data: { items, pending } });
}

/**
 * GET /api/pricing/sheet.csv — download the sheet.
 *
 * The filename carries the date because the point of the file is to be edited
 * and sent back: three of these in a downloads folder all called
 * "price-sheet.csv" is how the wrong week's prices get uploaded.
 */
export async function downloadPriceSheet(_req: Request, res: Response) {
  const items = await currentSheet();
  const today = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="buildora-prices-${today}.csv"`);
  return res.send(serializePriceSheet(items));
}

/* --------------------------------------------------------------- import --- */

/**
 * POST /api/pricing/sheet/import — the weekly upload.
 *
 * Awaited end to end, unlike the scheduled refresh triggers: the admin has just
 * uploaded a file and is watching for the result, and the three steps after the
 * write (embed the new labels, then reprice every project against them) are the
 * whole reason they uploaded it. See services/priceRefresh for why the *other*
 * triggers must never wait like this.
 */
export async function importPriceSheet(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: { message: "Attach a .csv file" } });
  }

  const text = req.file.buffer.toString("utf8");
  const { rows, errors } = parsePriceSheet(text);

  // All-or-nothing. A half-applied sheet is the worst outcome available: the
  // admin can't tell which half took, and the prices that didn't land look
  // exactly like prices that didn't move.
  if (errors.length > 0) {
    return res.status(400).json({
      error: { message: `${errors.length} row(s) couldn't be read — nothing was imported` },
      data: { report: emptyImportReport(rows.length + errors.length, errors) },
    });
  }
  if (rows.length === 0) {
    return res.status(400).json({
      error: { message: "The file has a header but no price rows" },
      data: { report: emptyImportReport(0, []) },
    });
  }

  const run = await PriceRefreshRun.create({ trigger: "IMPORT", status: "RUNNING" });
  const applied = await applyPriceSheet(rows);

  // Embedding is attempted after the write and its failure is recorded rather
  // than thrown: prices that landed are useful immediately (retrieval falls
  // back to matching by category), and losing the whole import because a model
  // wouldn't load would be a bad trade.
  let pricesEmbedded = 0;
  try {
    pricesEmbedded = await embedPending();
  } catch (err) {
    run.sourcesFailed.push({
      source: "embeddings",
      reason: err instanceof Error ? err.message : "unknown error",
    });
  }

  const { checked, updated } = await recalculateAllEstimates();

  run.pricesWritten = applied.added + applied.updated;
  run.pricesEmbedded = pricesEmbedded;
  run.estimatesChecked = checked;
  run.estimatesUpdated = updated;
  run.sourcesOk = [`Admin price sheet (${req.file.originalname})`];
  run.status = run.sourcesFailed.length > 0 ? "PARTIAL" : "OK";
  run.finishedAt = new Date();
  await run.save();

  const report: PriceSheetImportReport = {
    rowsRead: rows.length,
    added: applied.added,
    updated: applied.updated,
    unchanged: applied.unchanged,
    missing: applied.missing,
    errors: [],
    runId: String(run._id),
    pricesEmbedded,
    estimatesChecked: checked,
    estimatesUpdated: updated,
  };

  return res.status(200).json({ data: { report } });
}

/* --------------------------------------------------------------- writes --- */

/** A blank form field means "not set", not "the empty string". */
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const itemSchema = z.object({
  category: z.enum(ProductCategory, { message: "Choose a material category" }),
  itemLabel: z.string().trim().min(1, "Say what this item is").max(120),
  unit: z.string().trim().min(1, "Say what the price is per — bag, kg, cft, each").max(30),
  priceBdt: z.coerce.number().positive("A price must be greater than 0").max(10_000_000),
  sourceName: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  sourceUrl: z.preprocess(emptyToUndef, z.url("Enter a valid link").max(500).optional()),
  /** Optional back-dating, same rule as the CSV column. */
  effectiveFrom: z.preprocess(emptyToUndef, z.string().trim().optional()),
});

/** Shared by the add and the edit routes: an optional date, defaulting to now. */
function resolveEffectiveFrom(raw: string | undefined): Date | string {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "That isn't a valid date";
  if (parsed.getTime() > Date.now() + 86_400_000) return "That date is in the future";
  return parsed;
}

/**
 * POST /api/pricing/sheet/items — add an item to the sheet.
 *
 * Rejects a label that already exists rather than silently writing a second
 * item with the same name: two "OPC cement, 50kg bag" entries would compete for
 * the same retrieval match and whichever won would be arbitrary. Changing an
 * existing item's price is the PATCH below.
 */
export async function addPriceItem(req: Request, res: Response) {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: "Check the item details" },
      details: safeIssues(parsed.error.issues),
    });
  }

  const effectiveFrom = resolveEffectiveFrom(parsed.data.effectiveFrom);
  if (typeof effectiveFrom === "string") {
    return res.status(400).json({ error: { message: effectiveFrom } });
  }

  const sheet = await currentSheet();
  const clash = sheet.find(
    (item) =>
      item.category === parsed.data.category &&
      item.itemLabel.toLowerCase() === parsed.data.itemLabel.toLowerCase()
  );
  if (clash) {
    return res.status(409).json({
      error: { message: `"${clash.itemLabel}" is already on the sheet — edit its price instead` },
    });
  }

  const created = await MarketPrice.create({
    category: parsed.data.category,
    itemLabel: parsed.data.itemLabel,
    unit: parsed.data.unit,
    priceBdt: parsed.data.priceBdt,
    source: PriceSource.CURATED,
    sourceName: parsed.data.sourceName || OWN_SOURCE_NAME,
    sourceUrl: parsed.data.sourceUrl || undefined,
    approved: true,
    effectiveFrom,
  });

  return res.status(201).json({ data: { priceId: String(created._id) } });
}

const editSchema = z.object({
  priceBdt: z.coerce.number().positive("A price must be greater than 0").max(10_000_000),
  unit: z.preprocess(emptyToUndef, z.string().trim().min(1).max(30).optional()),
  sourceName: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  sourceUrl: z.preprocess(emptyToUndef, z.url("Enter a valid link").max(500).optional()),
  effectiveFrom: z.preprocess(emptyToUndef, z.string().trim().optional()),
});

/**
 * PATCH /api/pricing/sheet/items/:id — record a new price for an existing item.
 *
 * The `:id` names the row being *superseded*, not the row being changed. It is
 * read for the item's identity — category, label — and then left exactly as it
 * was while a new row is written beside it. That is what makes "cement was 505
 * in April and 540 in September" answerable later.
 */
export async function updatePriceItem(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: { message: "Bad price id" } });
  }

  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: "Check the new price" },
      details: safeIssues(parsed.error.issues),
    });
  }

  const previous = await MarketPrice.findById(req.params.id);
  if (!previous) {
    return res.status(404).json({ error: { message: "That price row no longer exists" } });
  }

  const effectiveFrom = resolveEffectiveFrom(parsed.data.effectiveFrom);
  if (typeof effectiveFrom === "string") {
    return res.status(400).json({ error: { message: effectiveFrom } });
  }

  const created = await MarketPrice.create({
    category: previous.category,
    itemLabel: previous.itemLabel,
    unit: parsed.data.unit || previous.unit,
    priceBdt: parsed.data.priceBdt,
    // A price a person has just retyped is theirs now, whatever the row they
    // edited said it was. Leaving it as MARKETPLACE would credit a median that
    // no longer produced this number.
    source: PriceSource.CURATED,
    sourceName: parsed.data.sourceName || OWN_SOURCE_NAME,
    sourceUrl: parsed.data.sourceUrl || undefined,
    approved: true,
    effectiveFrom,
  });

  return res.status(201).json({ data: { priceId: String(created._id) } });
}

/**
 * POST /api/pricing/sheet/items/:id/retire — take an item off the sheet.
 *
 * Writes a tombstone rather than deleting, so the item's history survives for
 * the estimates that were built on it. See MarketPrice.retired.
 */
export async function retirePriceItem(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: { message: "Bad price id" } });
  }

  const previous = await MarketPrice.findById(req.params.id);
  if (!previous) {
    return res.status(404).json({ error: { message: "That price row no longer exists" } });
  }

  await MarketPrice.create({
    category: previous.category,
    itemLabel: previous.itemLabel,
    unit: previous.unit,
    // The tombstone carries the last known price rather than a zero, so the row
    // still reads sensibly to anyone scrolling the history.
    priceBdt: previous.priceBdt,
    source: PriceSource.CURATED,
    sourceName: previous.sourceName,
    sourceUrl: previous.sourceUrl,
    approved: true,
    retired: true,
    effectiveFrom: new Date(),
  });

  return res.status(200).json({ data: { ok: true } });
}

/**
 * POST /api/pricing/sheet/pending/:id/approve — let a scraped row count.
 *
 * This is the gate priceSources describes: a parser meeting a redesigned page
 * produces confident nonsense, so nothing it reads can move an owner's estimate
 * until a person has looked at the number and agreed it is a real price.
 */
export async function approvePendingPrice(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: { message: "Bad price id" } });
  }

  const row = await MarketPrice.findById(req.params.id);
  if (!row) return res.status(404).json({ error: { message: "That price row no longer exists" } });
  if (row.approved) return res.status(200).json({ data: { ok: true } });

  row.approved = true;
  await row.save();

  return res.status(200).json({ data: { ok: true } });
}

/**
 * POST /api/pricing/sheet/pending/:id/reject — dismiss a scraped row.
 *
 * Retires it instead of deleting it. A rejected row never influenced a number,
 * so the audit argument is weaker here — but "the Bashundhara parser produced
 * 12,000 per bag three weeks running" is exactly the evidence that tells an
 * admin the parser is broken rather than the market strange, and deleting it
 * throws that away.
 */
export async function rejectPendingPrice(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: { message: "Bad price id" } });
  }

  const row = await MarketPrice.findById(req.params.id);
  if (!row) return res.status(404).json({ error: { message: "That price row no longer exists" } });

  row.retired = true;
  await row.save();

  return res.status(200).json({ data: { ok: true } });
}
