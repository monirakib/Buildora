import {
  PRICE_SHEET_COLUMNS,
  PriceSource,
  ProductCategory,
  type PriceSheetImportReport,
  type PriceSheetItem,
  type PriceSheetRowError,
} from "@buildora/shared";
import { MarketPrice, type MarketPriceDoc } from "../models/MarketPrice";

/**
 * The admin's weekly price sheet.
 *
 * ## Why a CSV at all
 *
 * Everything else feeding MarketPrice moves on its own or not at all: the
 * marketplace medians follow whatever suppliers happen to list, and the
 * manufacturer scrapers follow two pages that between them cover cement and
 * steel. Neither covers bricks, sand, tiles, paint, wiring or plumbing, and
 * neither can be told "the market moved this week". A person with a spreadsheet
 * can. So the curated layer gets a real editing surface, and the interchange
 * format is CSV because that is what a spreadsheet already speaks — the weekly
 * loop is download, edit in Excel, upload.
 *
 * ## What the CSV is and is not
 *
 * The CSV is **not** the store. Rows land in MarketPrice like every other
 * price, which is what keeps the estimator's retrieval, the staleness ladder
 * and the audit trail working unchanged. Two reasons it can't be a file:
 * Render's free tier has an ephemeral filesystem, so an uploaded file is gone
 * the next time the instance spins down; and a file overwritten weekly destroys
 * exactly the history an estimate from three months ago needs to stay
 * explainable.
 *
 * ## Import semantics, and the one thing they deliberately don't do
 *
 * An import is an upsert, never a replace. Items in the sheet are added or
 * given a new row; items *missing* from the file are reported back and left
 * alone. That asymmetry is on purpose — an admin who uploads a half-finished
 * file, or the wrong file, would otherwise wipe the price sheet by omission,
 * and the failure would be silent because an empty sheet still produces
 * estimates (they just quietly fall back). Retiring an item is a separate,
 * deliberate click.
 *
 * Validation is all-or-nothing: one bad row rejects the whole file with the
 * line numbers. A partial import is the worst outcome available, because the
 * admin has no way to know which half took.
 */

/** What we call ourselves on a row nobody else published. Matches the seed's rule. */
export const OWN_SOURCE_NAME = "Buildora admin price sheet";

/** Above this a "price" is a typo — a slipped decimal or a pasted phone number. */
const MAX_PRICE_BDT = 10_000_000;

/** One validated data row, ready to become a MarketPrice document. */
export interface PriceSheetRow {
  category: ProductCategory;
  itemLabel: string;
  unit: string;
  priceBdt: number;
  sourceName: string;
  sourceUrl?: string;
  effectiveFrom: Date;
}

/* --------------------------------------------------------------- CSV I/O --- */

/**
 * Splits CSV text into rows of fields.
 *
 * Written out rather than pulled from a library because the format's whole
 * grammar is three rules — a quote opens a quoted field, `""` inside one is a
 * literal quote, and a comma or newline outside quotes is a separator — and a
 * dependency for thirty lines is not a good trade on a project that has to be
 * explained line by line.
 *
 * Handles what Excel actually emits: CRLF endings, a UTF-8 BOM on the first
 * cell, and quoted fields containing commas ("Cement, 50kg bag" is a real
 * label and would otherwise split into two columns).
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a BOM; left in place it becomes part of the first header name
  // and "category" stops matching.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is an escaped quote; a lone one closes the field.
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // \r\n is one break, not two: skip the \n that follows a \r.
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Whatever is left when the text runs out is the last field of the last row,
  // unless the file ended with a newline and there is nothing pending.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Quotes a field only when it needs it, the way a spreadsheet writes them. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The current sheet as a CSV file.
 *
 * This is the other half of the weekly loop: what comes out here is exactly
 * what the importer accepts back, so an admin can round-trip the sheet through
 * Excel without hand-building a header row.
 */
export function serializePriceSheet(items: PriceSheetItem[]): string {
  const lines = [PRICE_SHEET_COLUMNS.join(",")];

  for (const item of items) {
    lines.push(
      [
        item.category,
        item.itemLabel,
        item.unit,
        String(item.priceBdt),
        item.sourceName,
        item.sourceUrl ?? "",
        // Date only. The time of day a price "took effect" is a fiction, and a
        // full ISO timestamp is a nuisance to edit in a spreadsheet cell.
        item.effectiveFrom.slice(0, 10),
      ]
        .map(csvField)
        .join(",")
    );
  }

  // Trailing newline: POSIX tools and Excel both expect one.
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------ validation --- */

/** Case-insensitive, whitespace-insensitive identity for one item. */
export function itemKey(category: string, itemLabel: string): string {
  return `${category.trim().toUpperCase()}::${itemLabel.trim().toLowerCase()}`;
}

/**
 * Validates one data row.
 *
 * Returns either the row or a message — never a partially-built row, so the
 * caller can't accidentally write something that half-passed.
 */
function validateRow(cells: Record<string, string>): PriceSheetRow | string {
  const category = cells.category?.trim().toUpperCase() ?? "";
  if (!category) return "category is empty";
  if (!Object.values(ProductCategory).includes(category as ProductCategory)) {
    return `"${category}" is not a category — use one of ${Object.values(ProductCategory).join(", ")}`;
  }

  const itemLabel = cells.itemLabel?.trim() ?? "";
  if (!itemLabel) return "itemLabel is empty";
  if (itemLabel.length > 120) return "itemLabel is longer than 120 characters";

  const unit = cells.unit?.trim() ?? "";
  if (!unit) return "unit is empty — say what the price is per (bag, kg, cft, each)";
  if (unit.length > 30) return "unit is longer than 30 characters";

  // Commas survive quoting, so "1,250" is a number a spreadsheet legitimately
  // produces. Strip them before parsing rather than rejecting the row.
  const rawPrice = (cells.priceBdt ?? "").replace(/,/g, "").trim();
  const priceBdt = Number(rawPrice);
  if (!rawPrice) return "priceBdt is empty";
  if (!Number.isFinite(priceBdt)) return `priceBdt "${cells.priceBdt}" is not a number`;
  if (priceBdt <= 0) return "priceBdt must be greater than 0";
  if (priceBdt > MAX_PRICE_BDT) {
    return `priceBdt ${priceBdt.toLocaleString()} is implausibly high — check for a slipped decimal`;
  }

  const sourceName = cells.sourceName?.trim() || OWN_SOURCE_NAME;
  if (sourceName.length > 120) return "sourceName is longer than 120 characters";

  const sourceUrl = cells.sourceUrl?.trim() || undefined;
  if (sourceUrl) {
    if (sourceUrl.length > 500) return "sourceUrl is longer than 500 characters";
    if (!/^https?:\/\//i.test(sourceUrl)) return "sourceUrl must start with http:// or https://";
  }

  // Blank means "this is today's figure", which is the normal case for a weekly
  // sheet. A date is only typed in when back-filling a bulletin from last week.
  const rawDate = cells.effectiveFrom?.trim() ?? "";
  let effectiveFrom = new Date();
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return `effectiveFrom "${rawDate}" is not a date — use YYYY-MM-DD`;
    }
    // A future date would sort ahead of every real row and read as fresher than
    // anything, which is the one direction the staleness ladder can't recover
    // from. One day of slack absorbs timezone differences.
    if (parsed.getTime() > Date.now() + 86_400_000) {
      return `effectiveFrom "${rawDate}" is in the future`;
    }
    effectiveFrom = parsed;
  }

  return {
    category: category as ProductCategory,
    itemLabel,
    unit,
    priceBdt,
    sourceName,
    sourceUrl,
    effectiveFrom,
  };
}

/**
 * Reads a whole uploaded file.
 *
 * Column *order* is not fixed — the header is read and cells are addressed by
 * name, because an admin who reorders columns in Excel has not done anything
 * wrong. Unknown extra columns are ignored for the same reason; a missing
 * required one is an error, since guessing which column held the price is not
 * something this should ever do.
 */
export function parsePriceSheet(text: string): {
  rows: PriceSheetRow[];
  errors: PriceSheetRowError[];
} {
  const grid = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (grid.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty" }] };

  const header = grid[0]!.map((h) => h.trim());
  const required = ["category", "itemLabel", "unit", "priceBdt"];
  const missingColumns = required.filter(
    (name) => !header.some((h) => h.toLowerCase() === name.toLowerCase())
  );
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `The header is missing ${missingColumns.join(", ")}. Expected: ${PRICE_SHEET_COLUMNS.join(", ")}`,
        },
      ],
    };
  }

  const rows: PriceSheetRow[] = [];
  const errors: PriceSheetRowError[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < grid.length; i += 1) {
    // +1 because the file's first line is line 1, and the header used it.
    const line = i + 1;
    const cells: Record<string, string> = {};
    header.forEach((name, col) => {
      // Matched case-insensitively so "ItemLabel" from a reformatted sheet works.
      const key = PRICE_SHEET_COLUMNS.find((c) => c.toLowerCase() === name.toLowerCase());
      if (key) cells[key] = grid[i]![col] ?? "";
    });

    const result = validateRow(cells);
    if (typeof result === "string") {
      errors.push({ line, message: result });
      continue;
    }

    // Two rows for one item leaves no defensible answer to "which price is it?"
    const key = itemKey(result.category, result.itemLabel);
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) {
      errors.push({
        line,
        message: `"${result.itemLabel}" already appears on line ${firstSeen}`,
      });
      continue;
    }
    seen.set(key, line);
    rows.push(result);
  }

  return { rows, errors };
}

/* ----------------------------------------------------------- the current --- */

function ageInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/**
 * The sheet as it stands: one entry per item, holding its newest approved row.
 *
 * The collection is append-only, so "the current price of cement" is a question
 * about the newest row and every row before it is history. Loading the lot and
 * grouping in memory is the same trade loadPriceCandidates makes and for the
 * same reason — a `$group` pipeline would be harder to read for no measurable
 * gain at this size.
 *
 * Two details that are load-bearing rather than incidental:
 *
 *   - **`embedding` is projected away.** It is 384 floats and it is the only
 *     field here with any real size; without excluding it this read would be
 *     roughly twenty times larger for data the sheet never looks at.
 *   - **The cap is generous on purpose.** An earlier version stopped at 2,000
 *     rows, which is fine until the collection passes that — at which point an
 *     item nobody had repriced in a while would have its newest row fall
 *     outside the window and *silently vanish from the sheet*, taking its price
 *     out of every estimate with it. Dropping the embeddings is what makes a
 *     cap this size cheap enough to be safe instead of merely optimistic.
 */
export async function currentSheet(): Promise<PriceSheetItem[]> {
  const rows = await MarketPrice.find({ approved: true })
    .select("-embedding")
    .sort({ effectiveFrom: -1 })
    .limit(50_000);

  const byItem = new Map<string, (MarketPriceDoc & { _id: unknown })[]>();
  for (const row of rows) {
    const key = itemKey(row.category, row.itemLabel);
    const list = byItem.get(key) ?? [];
    list.push(row as MarketPriceDoc & { _id: unknown });
    byItem.set(key, list);
  }

  const items: PriceSheetItem[] = [];
  for (const history of byItem.values()) {
    const newest = history[0]!;
    // A retirement row shadows everything under it — see MarketPrice.retired.
    if (newest.retired) continue;

    items.push({
      priceId: String(newest._id),
      category: newest.category,
      itemLabel: newest.itemLabel,
      unit: newest.unit,
      priceBdt: newest.priceBdt,
      source: newest.source,
      sourceName: newest.sourceName,
      sourceUrl: newest.sourceUrl,
      effectiveFrom: newest.effectiveFrom.toISOString(),
      ageDays: ageInDays(newest.effectiveFrom),
      revisions: history.length,
      previousPriceBdt: history[1]?.priceBdt,
      approved: true,
    });
  }

  // Grouped by category, then alphabetical: the order a person scanning for
  // "the cement rows" expects, and the order the CSV comes out in.
  return items.sort(
    (a, b) => a.category.localeCompare(b.category) || a.itemLabel.localeCompare(b.itemLabel)
  );
}

/**
 * Rows still waiting on an admin — in practice, everything the scrapers wrote.
 *
 * Kept out of `currentSheet` rather than mixed in with a flag, because these
 * are not prices yet. Nothing here can move an estimate, and showing them in
 * the same table as figures that can would blur the one distinction that
 * matters about them.
 */
export async function pendingPrices(): Promise<PriceSheetItem[]> {
  const rows = await MarketPrice.find({ approved: false, retired: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(200);

  return rows.map((row) => ({
    priceId: String(row._id),
    category: row.category,
    itemLabel: row.itemLabel,
    unit: row.unit,
    priceBdt: row.priceBdt,
    source: row.source,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    effectiveFrom: row.effectiveFrom.toISOString(),
    ageDays: ageInDays(row.effectiveFrom),
    revisions: 1,
    approved: false,
  }));
}

/* --------------------------------------------------------------- import --- */

/**
 * Applies a validated sheet.
 *
 * Only writes what actually changed. An admin who re-uploads last week's file
 * unchanged should get "42 unchanged" and no new rows — otherwise the history
 * fills with duplicate entries that make a real price move impossible to spot,
 * and every estimate gets recalculated against figures that did not move.
 *
 * The caller is responsible for embedding and repricing afterwards; this
 * function only touches the price collection.
 */
export async function applyPriceSheet(rows: PriceSheetRow[]): Promise<{
  added: number;
  updated: number;
  unchanged: number;
  missing: string[];
}> {
  const existing = await currentSheet();
  const byKey = new Map(existing.map((item) => [itemKey(item.category, item.itemLabel), item]));

  const docs: Partial<MarketPriceDoc>[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const current = byKey.get(itemKey(row.category, row.itemLabel));

    // A unit change counts as a change even at the same number: 520 per bag and
    // 520 per kg are different prices, and repricing compares units before it
    // divides (see repriceLine).
    if (current && current.priceBdt === row.priceBdt && current.unit === row.unit) {
      unchanged += 1;
      byKey.delete(itemKey(row.category, row.itemLabel));
      continue;
    }

    docs.push({
      category: row.category,
      itemLabel: row.itemLabel,
      unit: row.unit,
      priceBdt: row.priceBdt,
      source: PriceSource.CURATED,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      // A figure a person typed in and took responsibility for. The approval
      // queue exists for parsers, which can be confidently wrong; an admin
      // reviewing their own upload one row later would be theatre.
      approved: true,
      effectiveFrom: row.effectiveFrom,
    });

    if (current) {
      updated += 1;
      byKey.delete(itemKey(row.category, row.itemLabel));
    } else {
      added += 1;
    }
  }

  if (docs.length > 0) await MarketPrice.insertMany(docs);

  // Whatever is left in the map was in the sheet before and not in this file.
  // Reported, not retired — see the note at the top of this file.
  const missing = [...byKey.values()]
    // Marketplace medians are regenerated by the weekly job and are not the
    // admin's to maintain, so their absence from a curated sheet is normal and
    // flagging it would be noise.
    .filter((item) => item.source === PriceSource.CURATED)
    .map((item) => `${item.category} — ${item.itemLabel}`);

  return { added, updated, unchanged, missing };
}

/** An empty report, for the paths that reject a file before writing anything. */
export function emptyImportReport(
  rowsRead: number,
  errors: PriceSheetRowError[]
): PriceSheetImportReport {
  return {
    rowsRead,
    added: 0,
    updated: 0,
    unchanged: 0,
    missing: [],
    errors,
    pricesEmbedded: 0,
    estimatesChecked: 0,
    estimatesUpdated: 0,
  };
}
