import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  LandUse,
  type DapZone as DapZoneDto,
  type EcpsStep as EcpsStepDto,
  type FeeEstimate,
  type FeeRule as FeeRuleDto,
} from "@buildora/shared";
import { DapZone, type DapZoneDoc } from "../models/DapZone";
import { EcpsStep, type EcpsStepDoc } from "../models/EcpsStep";
import { FeeRule, type FeeRuleDoc } from "../models/FeeRule";

// All the permit reference data (DAP zones, fee rates, ECPS steps) lives in
// the database and is edited by admins here — never hardcoded in the app.

function toDapZoneDto(doc: HydratedDocument<DapZoneDoc>): DapZoneDto {
  return {
    id: doc._id.toString(),
    areaName: doc.areaName,
    zoneCode: doc.zoneCode,
    landUse: doc.landUse,
    maxFar: doc.maxFar,
    maxGroundCoveragePct: doc.maxGroundCoveragePct,
    maxFloors: doc.maxFloors,
    notes: doc.notes,
  };
}

function toFeeRuleDto(doc: HydratedDocument<FeeRuleDoc>): FeeRuleDto {
  return {
    id: doc._id.toString(),
    category: doc.category,
    label: doc.label,
    baseFeeBdt: doc.baseFeeBdt,
    ratePerSqmBdt: doc.ratePerSqmBdt,
    notes: doc.notes,
  };
}

function toEcpsStepDto(doc: HydratedDocument<EcpsStepDoc>): EcpsStepDto {
  return {
    id: doc._id.toString(),
    order: doc.order,
    title: doc.title,
    description: doc.description,
    requiredDocuments: doc.requiredDocuments,
  };
}

// ---------- Public: DAP zone checker ----------

/** GET /api/permits/dap-zones?search= — public zone lookup by area name or code. */
export async function listDapZones(req: Request, res: Response) {
  const filter: Record<string, unknown> = {};
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ areaName: rx }, { zoneCode: rx }];
  }
  const docs = await DapZone.find(filter).sort({ areaName: 1 }).limit(100);
  return res.json({ data: { zones: docs.map(toDapZoneDto) } });
}

/** True when `needle` appears inside `haystack` as a whole word. */
function containsWord(haystack: string, needle: string): boolean {
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${safe}\\b`, "i").test(haystack);
}

/**
 * GET /api/permits/dap-zone-for?area=Dhanmondi — the one zone that governs a
 * locality, for the brief form's "which zone is my plot in?" check.
 *
 * This matches differently from /dap-zones?search=. There the user types part
 * of a name and we widen ("Dhanm" → "Dhanmondi"). Here the name arrives from
 * the map, longer and more specific than the zone table ("Gulshan 2",
 * "Dhanmondi Residential Area"), so the zone name has to be found *inside* the
 * locality. The match therefore runs both ways, most specific first.
 */
export async function findDapZoneForArea(req: Request, res: Response) {
  const area = String(req.query.area ?? "").trim();
  if (area.length < 2) {
    return res.status(400).json({ error: { message: "Enter the area first" } });
  }

  // The zone table is admin-maintained and small, so ranking the candidates in
  // code here is clearer than expressing two-way containment as a Mongo query.
  const zones = await DapZone.find().limit(200);

  const ranked = zones
    .map((zone) => {
      const name = zone.areaName;
      let rank = 0;
      if (name.toLowerCase() === area.toLowerCase()) rank = 3;
      else if (containsWord(area, name))
        rank = 2; // "Gulshan 2" is in zone "Gulshan"
      else if (containsWord(name, area)) rank = 1; // "Gulshan" typed, zone "Gulshan Model Town"
      return { zone, rank };
    })
    .filter((c) => c.rank > 0)
    // Best rank first; ties go to the longer zone name, as the more specific one.
    .sort((a, b) => b.rank - a.rank || b.zone.areaName.length - a.zone.areaName.length);

  const best = ranked[0];
  return res.json({ data: { zone: best ? toDapZoneDto(best.zone) : null } });
}

// ---------- Public: RAJUK fee calculator ----------

/** GET /api/permits/fee-rules — the current rate table. */
export async function listFeeRules(_req: Request, res: Response) {
  const docs = await FeeRule.find().sort({ category: 1 });
  return res.json({ data: { rules: docs.map(toFeeRuleDto) } });
}

const feeEstimateSchema = z.object({
  category: z.enum(LandUse, { message: "Choose a land-use category" }),
  floorAreaSqm: z.coerce
    .number()
    .positive("Enter the proposed floor area in square metres")
    .max(1_000_000),
});

/**
 * POST /api/permits/fee-estimate — computes the RAJUK permit fee for a floor
 * area from the database rate table: base fee + rate × area.
 */
export async function estimateFee(req: Request, res: Response) {
  const parsed = feeEstimateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { category, floorAreaSqm } = parsed.data;

  const rule = await FeeRule.findOne({ category });
  if (!rule) {
    return res.status(404).json({
      error: { message: "No fee rate has been configured for this category yet" },
    });
  }

  const areaFeeBdt = Math.round(rule.ratePerSqmBdt * floorAreaSqm);
  const estimate: FeeEstimate = {
    category,
    floorAreaSqm,
    baseFeeBdt: rule.baseFeeBdt,
    ratePerSqmBdt: rule.ratePerSqmBdt,
    areaFeeBdt,
    totalBdt: rule.baseFeeBdt + areaFeeBdt,
  };
  return res.json({ data: { estimate } });
}

// ---------- Public: ECPS guide steps ----------

/** GET /api/permits/ecps-steps — the process steps, in walking order. */
export async function listEcpsSteps(_req: Request, res: Response) {
  const docs = await EcpsStep.find().sort({ order: 1 });
  return res.json({ data: { steps: docs.map(toEcpsStepDto) } });
}

// ---------- Admin CRUD ----------

const dapZoneSchema = z.object({
  areaName: z.string().trim().min(2, "Enter the area name").max(80),
  zoneCode: z.string().trim().min(1, "Enter the zone code").max(30),
  landUse: z.enum(LandUse, { message: "Choose a land use" }),
  maxFar: z.coerce.number().positive("Enter the maximum FAR"),
  maxGroundCoveragePct: z.coerce.number().min(1).max(100),
  maxFloors: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(100).optional()
  ),
  notes: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

const feeRuleSchema = z.object({
  category: z.enum(LandUse, { message: "Choose a category" }),
  label: z.string().trim().min(2, "Enter a display label").max(80),
  baseFeeBdt: z.coerce.number().min(0),
  ratePerSqmBdt: z.coerce.number().min(0),
  notes: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

const ecpsStepSchema = z.object({
  order: z.coerce.number().int().min(1, "Order starts at 1").max(50),
  title: z.string().trim().min(3, "Enter the step title").max(120),
  description: z.string().trim().min(10, "Describe the step").max(1000),
  // The form sends one textarea, one document per line.
  requiredDocuments: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
});

function zodError(res: Response, issues: z.ZodError["issues"]) {
  return res.status(400).json({
    error: { message: issues[0]?.message ?? "Invalid input", details: issues },
  });
}

/** POST /api/permits/dap-zones — admin adds a zone record. */
export async function createDapZone(req: Request, res: Response) {
  const parsed = dapZoneSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const doc = await DapZone.create(parsed.data);
  return res.status(201).json({ data: { zone: toDapZoneDto(doc) } });
}

/** PATCH /api/permits/dap-zones/:id — admin edits a zone record. */
export async function updateDapZone(req: Request, res: Response) {
  const parsed = dapZoneSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await DapZone.findById(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Zone not found" } });
  Object.assign(doc, parsed.data);
  await doc.save();
  return res.json({ data: { zone: toDapZoneDto(doc) } });
}

/** DELETE /api/permits/dap-zones/:id — admin removes a zone record. */
export async function deleteDapZone(req: Request, res: Response) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await DapZone.findByIdAndDelete(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Zone not found" } });
  return res.json({ data: { deleted: true } });
}

/** POST /api/permits/fee-rules — admin adds a rate (one per category). */
export async function createFeeRule(req: Request, res: Response) {
  const parsed = feeRuleSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const existing = await FeeRule.findOne({ category: parsed.data.category });
  if (existing) {
    return res.status(409).json({
      error: { message: "A rate for this category already exists. Edit it instead" },
    });
  }
  const doc = await FeeRule.create(parsed.data);
  return res.status(201).json({ data: { rule: toFeeRuleDto(doc) } });
}

/** PATCH /api/permits/fee-rules/:id — admin edits a rate. */
export async function updateFeeRule(req: Request, res: Response) {
  const parsed = feeRuleSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await FeeRule.findById(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Fee rule not found" } });
  const clash = await FeeRule.findOne({ category: parsed.data.category, _id: { $ne: doc._id } });
  if (clash) {
    return res
      .status(409)
      .json({ error: { message: "Another rate already covers this category" } });
  }
  Object.assign(doc, parsed.data);
  await doc.save();
  return res.json({ data: { rule: toFeeRuleDto(doc) } });
}

/** DELETE /api/permits/fee-rules/:id — admin removes a rate. */
export async function deleteFeeRule(req: Request, res: Response) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await FeeRule.findByIdAndDelete(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Fee rule not found" } });
  return res.json({ data: { deleted: true } });
}

/** POST /api/permits/ecps-steps — admin adds a process step. */
export async function createEcpsStep(req: Request, res: Response) {
  const parsed = ecpsStepSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const existing = await EcpsStep.findOne({ order: parsed.data.order });
  if (existing) {
    return res.status(409).json({ error: { message: "A step with this order already exists" } });
  }
  const doc = await EcpsStep.create(parsed.data);
  return res.status(201).json({ data: { step: toEcpsStepDto(doc) } });
}

/** PATCH /api/permits/ecps-steps/:id — admin edits a process step. */
export async function updateEcpsStep(req: Request, res: Response) {
  const parsed = ecpsStepSchema.safeParse(req.body);
  if (!parsed.success) return zodError(res, parsed.error.issues);
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await EcpsStep.findById(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Step not found" } });
  const clash = await EcpsStep.findOne({ order: parsed.data.order, _id: { $ne: doc._id } });
  if (clash) {
    return res.status(409).json({ error: { message: "Another step already has this order" } });
  }
  Object.assign(doc, parsed.data);
  await doc.save();
  return res.json({ data: { step: toEcpsStepDto(doc) } });
}

/** DELETE /api/permits/ecps-steps/:id — admin removes a process step. */
export async function deleteEcpsStep(req: Request, res: Response) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await EcpsStep.findByIdAndDelete(id) : null;
  if (!doc) return res.status(404).json({ error: { message: "Step not found" } });
  return res.json({ data: { deleted: true } });
}
