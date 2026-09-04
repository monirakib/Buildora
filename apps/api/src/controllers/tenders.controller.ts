import crypto from "node:crypto";
import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  NotificationType,
  ProjectStatus,
  TenderStatus,
  UserRole,
  VerificationStatus,
  floorAreaSqft,
  type BidOutlier,
  type BidSanityResult,
  type Tender as TenderDto,
  type TenderItem,
} from "@buildora/shared";
import { askAi, isAiConfigured } from "../services/ai";
import { screenNarrative } from "../services/aiGuard";
import { bandFor, isOutlier, loadRates, matchRate, percentDiff } from "../services/bidAnalysis";
import { refreshEstimate } from "../services/estimateLadder";
import { BoqRate } from "../models/BoqRate";
import { Bid } from "../models/Bid";
import { FloorPlan } from "../models/FloorPlan";
import { Project, type ProjectDoc } from "../models/Project";
import { Tender, type TenderDoc } from "../models/Tender";
import { User } from "../models/User";
import { notify, preview } from "../services/notifications";
import { refId } from "../utils/refId";
import { findProjectOr404 } from "./projects.controller";

/**
 * Contractor tendering.
 *
 * The owner drafts a Bill of Quantities, publishes it, and contractors submit
 * sealed bids until the deadline. Two rules run through everything here:
 *
 *   1. **Bids stay sealed while the tender is open.** Not hidden in the UI —
 *      refused by the server. See `bids.controller.ts`.
 *   2. **Contractors never see the guide rates.** `toTenderDto` strips them
 *      unless the reader owns the tender, because publishing the owner's own
 *      estimate would anchor every bid to it and defeat the point of tendering.
 *
 * There is no scheduler: a tender whose deadline has passed is closed the next
 * time anybody loads it (`settleDeadline`). One less moving part, and the
 * status can never be stale at the moment it is read.
 */

/** Only these roles can build. Suppliers sell materials, they don't tender. */
const BIDDER_ROLES = [UserRole.CONTRACTOR] as const;

function toTenderDto(
  doc: HydratedDocument<TenderDoc>,
  opts: { bidCount: number; isOwner: boolean; project?: { title: string }; owner?: unknown }
): TenderDto {
  const owner = doc.owner as unknown as {
    _id: unknown;
    name: string;
    username: string;
    company?: string;
  };
  const project = doc.project as unknown as { _id: unknown; title?: string };

  return {
    id: doc._id.toString(),
    projectId: String(project?._id ?? doc.project),
    projectTitle: opts.project?.title ?? project?.title ?? "",
    owner:
      owner && typeof owner === "object" && "name" in owner
        ? {
            id: String(owner._id),
            name: owner.name,
            username: owner.username,
            company: owner.company,
          }
        : { id: String(doc.owner), name: "", username: "" },
    title: doc.title,
    scope: doc.scope,
    // The guide rate is the owner's private estimate — never send it to a bidder.
    items: doc.items.map((item) => ({
      id: item.id,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      guideRateBdt: opts.isOwner ? item.guideRateBdt : undefined,
    })),
    deadlineAt: doc.deadlineAt.toISOString(),
    siteVisitAt: doc.siteVisitAt?.toISOString(),
    status: doc.status,
    estimatedBdt: opts.isOwner ? doc.estimatedBdt : undefined,
    bidCount: opts.bidCount,
    awardedBidId: doc.awardedBid?.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Flips an OPEN tender to CLOSED once its deadline has passed, and saves it.
 * Called on every read, which is what keeps the status honest without a cron.
 */
async function settleDeadline(tender: HydratedDocument<TenderDoc>) {
  if (tender.status === TenderStatus.OPEN && tender.deadlineAt.getTime() <= Date.now()) {
    tender.status = TenderStatus.CLOSED;
    await tender.save();
  }
  return tender;
}

/** Loads a tender by id, or answers 404. Populates owner and project. */
export async function findTenderOr404(id: unknown, res: Response) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Tender not found" } });
    return null;
  }
  const tender = await Tender.findById(id)
    .populate({ path: "owner", select: "name username company" })
    .populate({ path: "project", select: "title" });
  if (!tender) {
    res.status(404).json({ error: { message: "Tender not found" } });
    return null;
  }
  return settleDeadline(tender);
}

const itemInputSchema = z.object({
  description: z.string().trim().min(2, "Describe the work item").max(200),
  unit: z.string().trim().min(1, "Give the unit").max(20),
  quantity: z.number().min(0, "Quantity can't be negative"),
  guideRateBdt: z.number().min(0).optional(),
});

const tenderInputSchema = z.object({
  title: z.string().trim().min(4, "Give the tender a title").max(160),
  scope: z.string().trim().min(20, "Describe the scope of work").max(5000),
  items: z.array(itemInputSchema).min(1, "A tender needs at least one work item").max(200),
  deadlineAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a closing date"),
  siteVisitAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid site visit date")
    .optional(),
});

/** Gives each BOQ line a short id a bid can point at. */
function withIds(items: z.infer<typeof itemInputSchema>[]): TenderItem[] {
  return items.map((item) => ({ ...item, id: crypto.randomBytes(4).toString("hex") }));
}

/** The owner's own estimate: guide rate × quantity across every priced line. */
function estimate(items: TenderItem[]): number | undefined {
  const priced = items.filter((i) => typeof i.guideRateBdt === "number");
  if (priced.length === 0) return undefined;
  return Math.round(priced.reduce((sum, i) => sum + (i.guideRateBdt ?? 0) * i.quantity, 0));
}

/**
 * GET /api/projects/:id/boq-template — a starting Bill of Quantities.
 *
 * Multiplies the built-up area the architect already drew by the per-sqft
 * factors in the admin-editable rate table, so the owner edits a filled table
 * instead of inventing one. Falls back to bare rate lines with zero quantities
 * when no floor plan exists yet.
 */
export async function getBoqTemplate(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub && req.auth!.role !== UserRole.ADMIN) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const plans = await FloorPlan.find({ project: project._id });
  const builtAreaSqft = plans.reduce((sum, p) => sum + floorAreaSqft(p.rooms), 0);

  const rates = await BoqRate.find({ active: true }).sort({ order: 1 });
  const items = rates.map((rate) => ({
    description: rate.description,
    unit: rate.unit,
    // Round to something a person would actually write on a tender.
    quantity: Math.round(builtAreaSqft * rate.quantityPerSqft * 100) / 100,
    guideRateBdt: rate.ratePerUnitBdt,
    category: rate.category,
  }));

  return res.json({
    data: {
      builtAreaSqft: Math.round(builtAreaSqft),
      floorsDrawn: plans.filter((p) => p.rooms.length > 0).length,
      items,
    },
  });
}

/**
 * POST /api/projects/:id/tender — draft a tender.
 *
 * Drafts are private: nothing is visible to contractors until it's published.
 */
export async function createTender(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the project owner can tender" } });
  }

  const parsed = tenderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid tender",
        details: parsed.error.issues,
      },
    });
  }

  const items = withIds(parsed.data.items);
  let created;
  try {
    created = await Tender.create({
      project: project._id,
      owner: req.auth!.sub,
      title: parsed.data.title,
      scope: parsed.data.scope,
      items,
      deadlineAt: new Date(parsed.data.deadlineAt),
      siteVisitAt: parsed.data.siteVisitAt ? new Date(parsed.data.siteVisitAt) : undefined,
      estimatedBdt: estimate(items),
    });
  } catch (err) {
    // The unique partial index allows only one live tender per project.
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return res
        .status(409)
        .json({ error: { message: "This project already has a tender running" } });
    }
    throw err;
  }

  const populated = await created.populate([
    { path: "owner", select: "name username company" },
    { path: "project", select: "title" },
  ]);
  return res
    .status(201)
    .json({ data: { tender: toTenderDto(populated, { bidCount: 0, isOwner: true }) } });
}

/** GET /api/projects/:id/tender — the project's tender, if it has one. */
export async function getProjectTender(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;

  const tender = await Tender.findOne({ project: project._id })
    .sort({ createdAt: -1 })
    .populate({ path: "owner", select: "name username company" })
    .populate({ path: "project", select: "title" });
  if (!tender) return res.json({ data: { tender: null } });

  await settleDeadline(tender);
  const isOwner = String(project.owner) === req.auth!.sub || req.auth!.role === UserRole.ADMIN;

  // A draft belongs to nobody but its owner.
  if (tender.status === TenderStatus.DRAFT && !isOwner) {
    return res.json({ data: { tender: null } });
  }

  const bidCount = await Bid.countDocuments({ tender: tender._id });
  return res.json({ data: { tender: toTenderDto(tender, { bidCount, isOwner }) } });
}

/** PATCH /api/tenders/:id — edit a draft. Published tenders are fixed. */
export async function updateTender(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;
  if (refId(tender.owner) !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can edit this tender" } });
  }
  if (tender.status !== TenderStatus.DRAFT) {
    return res.status(409).json({
      error: { message: "A published tender can't be edited, contractors are pricing it" },
    });
  }

  const parsed = tenderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid tender",
        details: parsed.error.issues,
      },
    });
  }

  const items = withIds(parsed.data.items);
  tender.set({
    title: parsed.data.title,
    scope: parsed.data.scope,
    items,
    deadlineAt: new Date(parsed.data.deadlineAt),
    siteVisitAt: parsed.data.siteVisitAt ? new Date(parsed.data.siteVisitAt) : undefined,
    estimatedBdt: estimate(items),
  });
  await tender.save();

  return res.json({ data: { tender: toTenderDto(tender, { bidCount: 0, isOwner: true }) } });
}

/**
 * POST /api/tenders/:id/publish — open for bids.
 *
 * Also moves the project to BIDDING, which is what puts it in front of
 * contractors. Notifies every verified contractor that work is available;
 * that's the closest thing the platform has to a tender invitation until
 * email lands.
 */
export async function publishTender(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;
  const ownerId = refId(tender.owner);
  if (ownerId !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can publish this tender" } });
  }
  if (tender.status !== TenderStatus.DRAFT) {
    return res.status(409).json({ error: { message: "This tender is already published" } });
  }
  if (tender.deadlineAt.getTime() <= Date.now()) {
    return res
      .status(400)
      .json({ error: { message: "Set a closing date in the future before publishing" } });
  }

  tender.status = TenderStatus.OPEN;
  await tender.save();

  await Project.findByIdAndUpdate(tender.project, { status: ProjectStatus.BIDDING });

  // Fire-and-forget, like every other notification path.
  const contractors = await User.find({
    role: UserRole.CONTRACTOR,
    verificationStatus: VerificationStatus.APPROVED,
  }).select("_id");
  for (const contractor of contractors) {
    void notify(String(contractor._id), {
      type: NotificationType.TENDER,
      title: "New tender open for bids",
      body: preview(tender.title),
      link: `/tenders/${tender._id.toString()}`,
      actorId: req.auth!.sub,
    });
  }

  // A published BOQ carries real quantities, so the estimate can stop deriving
  // them from floor area. Free arithmetic, and it never throws.
  const publishedProject = await Project.findById(tender.project);
  if (publishedProject) await refreshEstimate(publishedProject);

  const bidCount = await Bid.countDocuments({ tender: tender._id });
  return res.json({
    data: {
      tender: toTenderDto(tender, { bidCount, isOwner: true }),
      invited: contractors.length,
    },
  });
}

/** POST /api/tenders/:id/close — stop taking bids early and start comparing. */
export async function closeTender(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;
  const ownerId = refId(tender.owner);
  if (ownerId !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can close this tender" } });
  }
  if (tender.status !== TenderStatus.OPEN) {
    return res.status(409).json({ error: { message: "This tender isn't open" } });
  }

  tender.status = TenderStatus.CLOSED;
  await tender.save();

  const bids = await Bid.find({ tender: tender._id }).select("contractor");
  for (const bid of bids) {
    void notify(String(bid.contractor), {
      type: NotificationType.TENDER,
      title: "Bidding closed",
      body: `Bidding has closed on "${tender.title}". The owner is comparing bids.`,
      link: `/tenders/${tender._id.toString()}`,
    });
  }

  // The top of the ladder: prices contractors actually committed to beat any
  // rate table, so the estimate is re-derived from the bids themselves.
  const closedProject = await Project.findById(tender.project);
  if (closedProject) await refreshEstimate(closedProject);

  return res.json({
    data: { tender: toTenderDto(tender, { bidCount: bids.length, isOwner: true }) },
  });
}

/** POST /api/tenders/:id/cancel — call the whole thing off. */
export async function cancelTender(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;
  const ownerId = refId(tender.owner);
  if (ownerId !== req.auth!.sub) {
    return res.status(403).json({ error: { message: "Only the owner can cancel this tender" } });
  }
  if (tender.status === TenderStatus.AWARDED) {
    return res
      .status(409)
      .json({ error: { message: "This tender was awarded, cancel the build contract instead" } });
  }

  tender.status = TenderStatus.CANCELLED;
  await tender.save();

  // Put the project back where it was before bidding started.
  await Project.findByIdAndUpdate(tender.project, { status: ProjectStatus.PERMIT_STAGE });

  const bids = await Bid.find({ tender: tender._id }).select("contractor");
  for (const bid of bids) {
    void notify(String(bid.contractor), {
      type: NotificationType.TENDER,
      title: "Tender cancelled",
      body: `"${tender.title}" was cancelled by the owner.`,
      link: "/tenders",
    });
  }

  return res.json({
    data: { tender: toTenderDto(tender, { bidCount: bids.length, isOwner: true }) },
  });
}

/**
 * GET /api/tenders — the contractor's board: everything open, closing soonest
 * first. Guide rates are stripped by `toTenderDto` for anyone but the owner.
 */
export async function listOpenTenders(req: Request, res: Response) {
  // Sweep any tender whose deadline passed while nobody was looking, so the
  // board never advertises one that can no longer be bid on.
  await Tender.updateMany(
    { status: TenderStatus.OPEN, deadlineAt: { $lte: new Date() } },
    { status: TenderStatus.CLOSED }
  );

  const tenders = await Tender.find({ status: TenderStatus.OPEN })
    .sort({ deadlineAt: 1 })
    .populate({ path: "owner", select: "name username company" })
    .populate({ path: "project", select: "title" });

  // Which of these the caller has already bid on, so the board can say so.
  const myBids = await Bid.find({
    contractor: req.auth!.sub,
    tender: { $in: tenders.map((t) => t._id) },
  }).select("tender");
  const bidOn = new Set(myBids.map((b) => String(b.tender)));

  return res.json({
    data: {
      tenders: tenders.map((t) => ({
        ...toTenderDto(t, { bidCount: 0, isOwner: false }),
        alreadyBid: bidOn.has(t._id.toString()),
      })),
    },
  });
}

/** GET /api/tenders/:id — one tender, as the caller is allowed to see it. */
export async function getTender(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;

  const ownerId = refId(tender.owner);
  const isOwner = ownerId === req.auth!.sub || req.auth!.role === UserRole.ADMIN;

  if (tender.status === TenderStatus.DRAFT && !isOwner) {
    return res.status(404).json({ error: { message: "Tender not found" } });
  }
  if (!isOwner && !BIDDER_ROLES.includes(req.auth!.role as UserRole.CONTRACTOR)) {
    return res.status(403).json({ error: { message: "Only contractors can view tenders" } });
  }

  const bidCount = await Bid.countDocuments({ tender: tender._id });
  const mine = isOwner
    ? null
    : await Bid.findOne({ tender: tender._id, contractor: req.auth!.sub });

  return res.json({
    data: {
      tender: toTenderDto(tender, { bidCount, isOwner }),
      myBidId: mine?._id.toString(),
    },
  });
}

export { toTenderDto, settleDeadline };
export type { ProjectDoc };

/* --------------------------------------------- AI: bid sanity check ------ */

const bidCheckSchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        ratePerUnitBdt: z.coerce.number().nonnegative(),
      })
    )
    .min(1, "Price at least one line first")
    .max(200),
  timelineWeeks: z.coerce.number().int().min(1).max(520).optional(),
});

/**
 * POST /api/tenders/:id/bid-check — a contractor's own sanity check before they
 * submit, benchmarked against the platform's BOQ rate table.
 *
 * **What this deliberately does not return: any absolute benchmark figure.**
 * The rate table is where the owner's guide rates come from, so an exact
 * percentage would let a bidder divide their way back to the owner's estimate —
 * the very thing `toTenderDto` strips the guide rates to prevent. So the answer
 * is a direction and a coarse band, which is enough to catch a fat-fingered
 * rate without handing over the owner's position.
 *
 * The numbers here are compared in TypeScript; the model only writes the note.
 */
export async function bidSanityCheck(req: Request, res: Response) {
  const tender = await findTenderOr404(req.params.id, res);
  if (!tender) return;

  await settleDeadline(tender);

  // Only a bidder needs this, and only while there is still time to act on it.
  if (req.auth!.role !== UserRole.CONTRACTOR) {
    return res.status(403).json({ error: { message: "Only contractors can check a bid" } });
  }
  if (tender.status !== TenderStatus.OPEN) {
    return res
      .status(400)
      .json({ error: { message: "This tender isn't open for bidding any more" } });
  }

  const parsed = bidCheckSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const rates = await loadRates();
  const byItemId = new Map(tender.items.map((i) => [i.id, i]));

  let yourTotalBdt = 0;
  let linesBenchmarked = 0;
  let linesUnmatched = 0;
  let benchmarkTotal = 0;
  let pricedAgainstBenchmark = 0;
  const outliers: BidOutlier[] = [];

  for (const line of parsed.data.lines) {
    const item = byItemId.get(line.itemId);
    if (!item) continue;

    // The quantity is the tender's, never the bidder's — same rule as the real
    // bid submission, where the server recomputes every amount.
    yourTotalBdt += line.ratePerUnitBdt * item.quantity;

    const rate = matchRate(item.description, rates);
    if (!rate) {
      linesUnmatched += 1;
      continue;
    }
    linesBenchmarked += 1;
    benchmarkTotal += rate.ratePerUnitBdt * item.quantity;
    pricedAgainstBenchmark += line.ratePerUnitBdt * item.quantity;

    const pct = percentDiff(line.ratePerUnitBdt, rate.ratePerUnitBdt);
    if (isOutlier(pct)) {
      outliers.push({
        itemId: item.id,
        description: item.description,
        unit: item.unit,
        direction: pct > 0 ? "high" : "low",
        band: bandFor(Math.abs(pct)),
      });
    }
  }

  const overallPct =
    linesBenchmarked > 0 && benchmarkTotal > 0
      ? percentDiff(pricedAgainstBenchmark, benchmarkTotal)
      : 0;
  const overallBand: BidSanityResult["overallBand"] = !isOutlier(overallPct)
    ? "within"
    : overallPct > 0
      ? "high"
      : "low";

  // A timeline far below what the work usually takes is its own kind of risk.
  const timelineNote =
    parsed.data.timelineWeeks != null && parsed.data.timelineWeeks < 8
      ? `${parsed.data.timelineWeeks} weeks is very short for a build of this size. Make sure you can hold to it — the milestones are inspected before any money is released.`
      : null;

  const result: BidSanityResult = {
    yourTotalBdt: Math.round(yourTotalBdt),
    linesPriced: parsed.data.lines.length,
    linesBenchmarked,
    linesUnmatched,
    overallBand,
    outliers: outliers.slice(0, 8),
    timelineNote,
    narrative: null,
  };

  result.narrative = await narrateBidCheck(result);
  return res.json({ data: { check: result } });
}

/** Writes the note. Bands only — no figure the bidder couldn't already see. */
async function narrateBidCheck(result: BidSanityResult): Promise<string | null> {
  if (!isAiConfigured()) return null;

  const lines = result.outliers
    .map((o) => `- ${o.description} (${o.unit}): ${o.direction} by ${o.band}`)
    .join("\n");

  const prompt = `You are advising a construction contractor in Bangladesh who is about to submit a sealed bid on Buildora.

These findings are already worked out. Do NOT recalculate them and do NOT invent any benchmark figure:
Their bid total: ${result.yourTotalBdt} BDT
Lines priced: ${result.linesPriced}; compared against the platform rate table: ${result.linesBenchmarked}; not on the table: ${result.linesUnmatched}
Overall, their pricing is: ${result.overallBand}
Lines that stand out:
${lines || "- none"}
${result.timelineNote ?? ""}

Write one short paragraph, plain text, no markdown:
- If lines stand out, name them and say what usually causes a gap that size (a unit mix-up, a rate typed per unit instead of per hundred, or genuinely different specification).
- If nothing stands out, say the pricing looks consistent with the platform's rates.
- Remind them the quantities are fixed by the tender and only their rates are being compared.

You do not know and must never state the benchmark rate, the owner's estimate, or any other bidder's price. Never state a percentage — only the bands given above.`;

  try {
    const answer = await askAi({ messages: [{ role: "user", content: prompt }], maxTokens: 350 });
    return screenNarrative(answer.text);
  } catch (err) {
    console.error("[bidcheck] narrative unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
