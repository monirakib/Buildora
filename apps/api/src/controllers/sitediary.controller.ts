import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  LabourTrade,
  NotificationType,
  UserRole,
  addDays,
  dhakaDateKey,
  isRainDay,
  weekStartSaturday,
  type DiaryDigest,
  type SiteDiaryEntry as SiteDiaryEntryDto,
  type SiteDiarySummary,
} from "@buildora/shared";
import { askAi, isAiConfigured } from "../services/ai";
import { fenced, sanitizeForPrompt } from "../services/aiSafety";
import {
  SiteDiaryEntry,
  type SiteDiaryEntryDoc,
  type WeatherSnapshotDoc,
} from "../models/SiteDiaryEntry";
import type { ProjectDoc } from "../models/Project";
import { getForecast, getWeatherForDate } from "../services/weather";
import { notify, preview } from "../services/notifications";
import { findProjectOr404 } from "./projects.controller";

/**
 * The site diary: one entry per project per day, each stamped with the weather
 * over the plot (see services/weather.ts).
 *
 * Anyone working on the project can write an entry — the owner, the architect,
 * and the structural engineer who supervises the site. When contractor bidding
 * lands, the awarded contractor joins that list; there is no contractor on a
 * project to check against yet.
 */

/** How far ahead the forecast strip looks. Open-Meteo will serve up to 16. */
const FORECAST_DAYS = 7;

/** Nothing before this is worth back-dating an entry to. */
const MAX_BACKDATE_DAYS = 730;

type AuthorRef = { _id: unknown; name: string; username: string; company?: string };

function toEntryDto(doc: HydratedDocument<SiteDiaryEntryDoc>): SiteDiaryEntryDto {
  const author = doc.author as unknown as AuthorRef;
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    date: doc.date,
    author: {
      id: String(author._id),
      name: author.name,
      username: author.username,
      company: author.company,
    },
    workDone: doc.workDone,
    labour: doc.labour.map((l) => ({ trade: l.trade, count: l.count })),
    materials: doc.materials.map((m) => ({
      item: m.item,
      quantity: m.quantity,
      unit: m.unit,
    })),
    equipment: doc.equipment,
    issues: doc.issues,
    photoUrls: doc.photoUrls,
    // Listed field by field rather than spread: `doc.weather` is a Mongoose
    // subdocument, and spreading one copies its internals instead of its data,
    // leaving every value undefined. Same reason projects.controller.ts spells
    // out `location`.
    weather: doc.weather
      ? {
          tempMaxC: doc.weather.tempMaxC,
          tempMinC: doc.weather.tempMinC,
          rainfallMm: doc.weather.rainfallMm,
          windMaxKph: doc.weather.windMaxKph,
          weatherCode: doc.weather.weatherCode,
          description: doc.weather.description,
          source: doc.weather.source,
          fetchedAt: doc.weather.fetchedAt.toISOString(),
        }
      : undefined,
    isRainDay: doc.isRainDay,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The diary is for the people working on the project. */
function canAccessDiary(
  project: HydratedDocument<ProjectDoc>,
  auth: { sub: string; role: UserRole }
) {
  return (
    String(project.owner) === auth.sub ||
    (project.architect && String(project.architect) === auth.sub) ||
    (project.engineer && String(project.engineer) === auth.sub) ||
    // The contractor is the one actually on site, so the daily log is as much
    // theirs as anybody's.
    (project.contractor && String(project.contractor) === auth.sub) ||
    auth.role === UserRole.ADMIN
  );
}

const labourSchema = z.object({
  trade: z.enum(LabourTrade, { message: "Pick a trade" }),
  count: z.number().int().min(0).max(2000),
});

const materialSchema = z.object({
  item: z.string().trim().min(1, "Name the material").max(80),
  quantity: z.number().min(0),
  unit: z.string().trim().min(1, "Give the unit").max(20),
});

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "That isn't a real date");

/** The fields a writer fills in. Weather is never among them — the server stamps it. */
const entryBodySchema = z.object({
  workDone: z.string().trim().min(3, "Write down what was done").max(3000),
  labour: z.array(labourSchema).max(20).default([]),
  materials: z.array(materialSchema).max(40).default([]),
  equipment: z.string().trim().max(300).optional(),
  issues: z.string().trim().max(2000).optional(),
  photoUrls: z.array(z.url("Each photo must be a valid link")).max(12).default([]),
});

const createSchema = entryBodySchema.extend({ date: dateSchema });

/**
 * Fetches the weather over the plot for a date, if the project has a map pin.
 *
 * Never throws: an entry is worth saving whether or not the weather service
 * answered, and a site supervisor logging the day's work should not be blocked
 * by someone else's API being down. An entry that ends up without a snapshot
 * shows as "weather unavailable" and can be re-stamped later by editing it.
 */
async function stampWeather(
  project: HydratedDocument<ProjectDoc>,
  date: string
): Promise<WeatherSnapshotDoc | undefined> {
  if (!project.location) return undefined;
  try {
    const snapshot = await getWeatherForDate(project.location.lat, project.location.lng, date);
    // The shared DTO carries `fetchedAt` as an ISO string because that is what
    // crosses the wire; the document stores a real Date. Convert here, at the
    // one boundary between them.
    return snapshot ? { ...snapshot, fetchedAt: new Date(snapshot.fetchedAt) } : undefined;
  } catch (err) {
    console.error(`[sitediary] weather lookup failed for ${date}:`, err);
    return undefined;
  }
}

/**
 * Running totals over the whole diary, computed by the database rather than
 * from the returned page, so they stay right however many entries there are.
 */
async function buildSummary(projectId: unknown): Promise<SiteDiarySummary> {
  const [row] = await SiteDiaryEntry.aggregate<{
    entryCount: number;
    rainDays: number;
    totalRainfallMm: number;
    labourDays: number;
    firstDate: string;
    lastDate: string;
  }>([
    { $match: { project: projectId } },
    {
      $group: {
        _id: null,
        entryCount: { $sum: 1 },
        rainDays: { $sum: { $cond: ["$isRainDay", 1, 0] } },
        totalRainfallMm: { $sum: { $ifNull: ["$weather.rainfallMm", 0] } },
        // The inner $sum collapses one entry's per-trade counts; the outer adds
        // those daily headcounts up into labour-days across the diary.
        labourDays: { $sum: { $sum: "$labour.count" } },
        firstDate: { $min: "$date" },
        lastDate: { $max: "$date" },
      },
    },
  ]);

  if (!row) {
    return { entryCount: 0, rainDays: 0, totalRainfallMm: 0, labourDays: 0 };
  }
  return {
    entryCount: row.entryCount,
    rainDays: row.rainDays,
    totalRainfallMm: Math.round(row.totalRainfallMm * 10) / 10,
    labourDays: row.labourDays,
    firstDate: row.firstDate,
    lastDate: row.lastDate,
  };
}

/** Tells everyone else on the project that the day was logged. */
function notifyParticipants(
  project: HydratedDocument<ProjectDoc>,
  authorId: string,
  entry: HydratedDocument<SiteDiaryEntryDoc>
) {
  const audience = [project.owner, project.architect, project.engineer]
    .filter(Boolean)
    .map(String)
    .filter((id) => id !== authorId);

  for (const userId of new Set(audience)) {
    void notify(userId, {
      type: NotificationType.SITE_DIARY,
      title: `Site diary, ${entry.date}`,
      body: preview(entry.workDone),
      link: `/projects/${project._id.toString()}`,
      actorId: authorId,
    });
  }
}

/**
 * GET /api/projects/:id/diary — the whole diary, newest day first, with the
 * running totals and whether this user may write.
 */
export async function listSiteDiary(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const entries = await SiteDiaryEntry.find({ project: project._id })
    .sort({ date: -1 })
    .populate({ path: "author", select: "name username company" });

  return res.json({
    data: {
      entries: entries.map(toEntryDto),
      summary: await buildSummary(project._id),
      hasPlotPin: Boolean(project.location),
    },
  });
}

/**
 * GET /api/projects/:id/diary/forecast — the week ahead over the plot, so the
 * site can see whether a pour scheduled for Thursday is still sensible.
 */
export async function getSiteForecast(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  if (!project.location) {
    return res.status(409).json({
      error: { message: "Add a map pin to the project brief to see the site forecast" },
    });
  }

  try {
    const forecast = await getForecast(project.location.lat, project.location.lng, FORECAST_DAYS);
    return res.json({ data: { forecast } });
  } catch (err) {
    return res.status(502).json({
      error: { message: err instanceof Error ? err.message : "Weather lookup failed" },
    });
  }
}

/** POST /api/projects/:id/diary — log a day. */
export async function createSiteDiaryEntry(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid entry",
        details: parsed.error.issues,
      },
    });
  }
  const { date, ...body } = parsed.data;

  // A diary records what happened, so tomorrow is not a valid entry — and the
  // weather stamp for a future date would be a forecast masquerading as a
  // reading. "Today" is the Dhaka calendar day, not the server's.
  const today = dhakaDateKey(new Date());
  if (date > today) {
    return res.status(400).json({ error: { message: "You can't log a day that hasn't happened" } });
  }
  const ageDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000
  );
  if (ageDays > MAX_BACKDATE_DAYS) {
    return res.status(400).json({ error: { message: "That date is too far in the past" } });
  }

  const weather = await stampWeather(project, date);

  let created;
  try {
    created = await SiteDiaryEntry.create({
      ...body,
      project: project._id,
      author: req.auth!.sub,
      date,
      weather,
      isRainDay: weather ? isRainDay(weather.rainfallMm) : false,
    });
  } catch (err) {
    // The unique {project, date} index is what enforces one entry per day.
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return res
        .status(409)
        .json({ error: { message: `${date} is already logged. Edit that entry instead` } });
    }
    throw err;
  }

  const populated = await created.populate({ path: "author", select: "name username company" });
  notifyParticipants(project, req.auth!.sub, populated);

  return res.status(201).json({
    data: { entry: toEntryDto(populated), summary: await buildSummary(project._id) },
  });
}

/**
 * PATCH /api/projects/:id/diary/:entryId — correct a day's record.
 *
 * The date is not editable: moving an entry to another day would collide with
 * whatever is already filed there and would leave the weather stamp describing
 * a different day than the one being claimed. Delete and re-log instead.
 *
 * An entry that saved without weather (the service was down, or the brief had
 * no pin at the time) gets another attempt here — that is the recovery path.
 */
export async function updateSiteDiaryEntry(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const { entryId } = req.params;
  const entry = isValidObjectId(entryId)
    ? await SiteDiaryEntry.findOne({ _id: entryId, project: project._id })
    : null;
  if (!entry) {
    return res.status(404).json({ error: { message: "Diary entry not found" } });
  }

  // A diary is a personal record of what someone saw. Others read it; only the
  // person who wrote it (or an admin) rewrites it.
  if (String(entry.author) !== req.auth!.sub && req.auth!.role !== UserRole.ADMIN) {
    return res
      .status(403)
      .json({ error: { message: "Only the person who wrote this entry can edit it" } });
  }

  const parsed = entryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid entry",
        details: parsed.error.issues,
      },
    });
  }

  entry.set(parsed.data);

  if (!entry.weather) {
    const weather = await stampWeather(project, entry.date);
    if (weather) {
      entry.weather = weather;
      entry.isRainDay = isRainDay(weather.rainfallMm);
    }
  }

  await entry.save();
  const populated = await entry.populate({ path: "author", select: "name username company" });

  return res.json({
    data: { entry: toEntryDto(populated), summary: await buildSummary(project._id) },
  });
}

/** DELETE /api/projects/:id/diary/:entryId — the author or the owner removes it. */
export async function deleteSiteDiaryEntry(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const { entryId } = req.params;
  const entry = isValidObjectId(entryId)
    ? await SiteDiaryEntry.findOne({ _id: entryId, project: project._id })
    : null;
  if (!entry) {
    return res.status(404).json({ error: { message: "Diary entry not found" } });
  }

  const isAuthor = String(entry.author) === req.auth!.sub;
  const isOwner = String(project.owner) === req.auth!.sub;
  if (!isAuthor && !isOwner && req.auth!.role !== UserRole.ADMIN) {
    return res
      .status(403)
      .json({ error: { message: "Only the author or the project owner can remove this" } });
  }

  await entry.deleteOne();
  return res.json({ data: { deleted: true, summary: await buildSummary(project._id) } });
}

/**
 * GET /api/projects/:id/diary/digest?weekOf=YYYY-MM-DD — one week of the diary,
 * counted.
 *
 * The week runs Saturday to Friday, which is the Bangladeshi working week, and
 * defaults to the one containing today in Dhaka. Because `date` is stored as a
 * "YYYY-MM-DD" string, "this week" is a plain string range — lexical order and
 * chronological order are the same thing here, so there is no date arithmetic
 * in the query and no timezone to get wrong.
 *
 * Every figure below is counted in code from real entries. The model is given
 * the finished counts and asked only to describe what they add up to, in
 * particular what the rain did to the schedule.
 */
export async function getDiaryDigest(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;
  if (!canAccessDiary(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const requested = String(req.query.weekOf ?? "").trim();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : dhakaDateKey(new Date());
  const weekStart = weekStartSaturday(anchor);
  const weekEnd = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);

  const [entries, prevEntries] = await Promise.all([
    SiteDiaryEntry.find({
      project: project._id,
      date: { $gte: weekStart, $lte: weekEnd },
    }).sort({ date: 1 }),
    SiteDiaryEntry.find({
      project: project._id,
      date: { $gte: prevStart, $lte: addDays(prevStart, 6) },
    }),
  ]);

  const headcount = (e: (typeof entries)[number]) => e.labour.reduce((sum, l) => sum + l.count, 0);

  // Per-trade and per-material totals, merged across the week.
  const trades = new Map<string, number>();
  const materials = new Map<string, { item: string; unit: string; quantity: number }>();
  let peakLabour: { date: string; count: number } | null = null;
  const issueDates: string[] = [];
  let labourDays = 0;
  let rainDays = 0;
  let totalRainfallMm = 0;

  for (const entry of entries) {
    const count = headcount(entry);
    labourDays += count;
    if (!peakLabour || count > peakLabour.count) peakLabour = { date: entry.date, count };

    for (const l of entry.labour) trades.set(l.trade, (trades.get(l.trade) ?? 0) + l.count);
    for (const m of entry.materials) {
      // Same material in different units stays separate — adding 3 bags to
      // 3 tonnes would be worse than not summing at all.
      const key = `${m.item.toLowerCase()}|${m.unit.toLowerCase()}`;
      const existing = materials.get(key);
      if (existing) existing.quantity += m.quantity;
      else materials.set(key, { item: m.item, unit: m.unit, quantity: m.quantity });
    }

    if (entry.isRainDay) rainDays += 1;
    totalRainfallMm += entry.weather?.rainfallMm ?? 0;
    if (entry.issues?.trim()) issueDates.push(entry.date);
  }

  const digest: DiaryDigest = {
    weekStart,
    weekEnd,
    daysLogged: entries.length,
    rainDays,
    totalRainfallMm: Math.round(totalRainfallMm * 10) / 10,
    labourDays,
    peakLabour,
    trades: [...trades.entries()]
      .map(([trade, count]) => ({ trade, count }))
      .sort((a, b) => b.count - a.count),
    materials: [...materials.values()].sort((a, b) => b.quantity - a.quantity),
    issueCount: issueDates.length,
    issueDates,
    previousWeekLabourDays: prevEntries.length
      ? prevEntries.reduce((sum, e) => sum + headcount(e), 0)
      : null,
    narrative: null,
  };

  digest.narrative = await narrateDigest(project.title, digest, entries);
  return res.json({ data: { digest } });
}

/** Asks the model to read the week. Returns null when it can't — the counts stand alone. */
async function narrateDigest(
  projectTitle: string,
  digest: DiaryDigest,
  entries: HydratedDocument<SiteDiaryEntryDoc>[]
): Promise<string | null> {
  if (!isAiConfigured() || digest.daysLogged === 0) return null;

  // What was actually written each day, trimmed and fenced — it is text other
  // people typed, so it is data to read, not instructions to follow.
  const log = entries
    .map(
      (e) =>
        `${e.date}${e.isRainDay ? " (rain day)" : ""}: ${e.workDone}${e.issues ? ` | ISSUE: ${e.issues}` : ""}`
    )
    .join("\n");

  const prompt = `You are a site manager in Bangladesh writing the weekly note for a construction project called "${projectTitle}".

These figures are already counted and are NOT to be recalculated:
Week: ${digest.weekStart} to ${digest.weekEnd}
Days logged: ${digest.daysLogged} of 7
Rain days: ${digest.rainDays}, total rainfall ${digest.totalRainfallMm} mm
Labour-days: ${digest.labourDays}${digest.previousWeekLabourDays != null ? ` (previous week: ${digest.previousWeekLabourDays})` : ""}
${digest.peakLabour ? `Busiest day: ${digest.peakLabour.date} with ${digest.peakLabour.count} workers` : ""}
Trades: ${digest.trades.map((t) => `${t.trade} ${t.count}`).join(", ") || "none recorded"}
Materials: ${digest.materials.map((m) => `${m.item} ${m.quantity} ${m.unit}`).join(", ") || "none recorded"}
Days with issues: ${digest.issueCount}

${fenced("this week's diary entries", sanitizeForPrompt(log, 1600))}

Write two short paragraphs, plain text, no markdown and no headings:
1. What got done this week, and whether it was busier or quieter than last week.
2. What held things up — be specific about whether rain cost working days — and what to watch next week.

Do not invent any number that is not above. Do not estimate a completion date.`;

  try {
    const answer = await askAi({ messages: [{ role: "user", content: prompt }], maxTokens: 400 });
    return answer.text || null;
  } catch (err) {
    console.error(
      "[sitediary] digest narrative unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export { canAccessDiary };
