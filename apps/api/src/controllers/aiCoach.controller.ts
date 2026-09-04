import type { Request, Response } from "express";
import { z } from "zod";
import {
  BuildingType,
  KATHA_TO_SQM,
  ProjectStatus,
  ProposalStatus,
  type BriefCheck,
  type BriefCoachResult,
  type ProfessionalProfile,
} from "@buildora/shared";
import { askAi, isAiConfigured } from "../services/ai";
import { screenNarrative } from "../services/aiGuard";
import { findZoneForArea } from "../services/dapZones";
import { fenced, sanitizeForPrompt, TRUNCATE } from "../services/aiSafety";
import { FeeRule } from "../models/FeeRule";
import { Proposal } from "../models/Proposal";
import { User } from "../models/User";
import { canViewProject, findProjectOr404 } from "./projects.controller";

/**
 * The brief coach.
 *
 * A land owner filling in the brief form can press one button and be told what
 * is wrong with it before they post it — mostly that the building they've
 * described doesn't fit the zone their plot is in.
 *
 * The split matters here more than anywhere else on the platform. **Every check
 * below is decided in TypeScript** against the admin-maintained DapZone table,
 * using the same FAR and ground-coverage arithmetic the brief form already
 * shows on screen. The model is handed the finished list and asked to write a
 * paragraph about it. It never decides whether something is a problem, and it
 * never produces a number.
 *
 * That's also why the narrative fails soft: with no API key, or a provider
 * having a bad day, the owner still gets every check and every figure. Only the
 * prose goes missing.
 */

/** Empty strings from an unfinished form mean "not filled in", not zero. */
const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative().optional()
);

const coachSchema = z.object({
  areaName: z.string().trim().min(2, "Enter the area first").max(120),
  landAreaKatha: optionalNumber,
  buildingType: z.enum(BuildingType).optional(),
  floors: optionalNumber,
  budgetMinBdt: optionalNumber,
  budgetMaxBdt: optionalNumber,
  roadWidthFt: optionalNumber,
  unitsPerFloor: optionalNumber,
  bedroomsPerUnit: optionalNumber,
  parkingSpaces: optionalNumber,
  soilTestDone: z.boolean().optional(),
  ownershipDocsReady: z.boolean().optional(),
  description: z.string().max(4000).optional(),
});

type CoachInput = z.infer<typeof coachSchema>;

/** Asks the model to explain the findings. Returns null when it can't. */
async function narrate(input: CoachInput, result: BriefCoachResult): Promise<string | null> {
  if (!isAiConfigured()) return null;

  const checkLines = result.checks.map((c) => `- [${c.severity}] ${c.text}`).join("\n");
  const zoneLine = result.zone
    ? `Zone ${result.zone.zoneCode} (${result.zone.areaName}): ${result.zone.landUse}, max FAR ${result.zone.maxFar}, max ground coverage ${result.zone.maxGroundCoveragePct}%${result.zone.maxFloors ? `, max ${result.zone.maxFloors} floors` : ""}`
    : `Buildora has no DAP zone record for ${input.areaName}.`;

  const prompt = `You are advising a land owner in Bangladesh who is writing a project brief on Buildora.

These findings are already decided and these figures are already calculated. Do NOT recalculate, correct, or add to them:
${zoneLine}
Plot: ${input.landAreaKatha ?? "?"} katha (${result.plotSqm.toFixed(1)} sqm), ${input.floors ?? "?"} floors, ${input.buildingType ?? "type not chosen"}
${result.maxFloorAreaSqm != null ? `Zone allows up to ${result.maxFloorAreaSqm.toFixed(1)} sqm of total floor area, footprint at most ${result.maxFootprintSqm?.toFixed(1)} sqm.` : ""}
${result.perFloorSqm != null ? `That averages ${result.perFloorSqm.toFixed(1)} sqm per floor.` : ""}
${result.permitFeeBdt != null ? `Indicative RAJUK permit fee: ${result.permitFeeBdt} BDT.` : ""}

Findings:
${checkLines || "- No problems found."}

${input.description?.trim() ? fenced("their draft description", sanitizeForPrompt(input.description, TRUNCATE.projectDescription)) : ""}

Write two short paragraphs, plain text, no markdown and no headings:
1. What stands out most about this brief. Lead with any blocker; if there are none, say the brief looks workable and why.
2. What to change or add before posting it, so architects can price and design it properly.

Rules: do not invent any number that is not above. Do not use the words "quote", "final" or "guaranteed". Never promise an approval outcome — Buildora guides the process, RAJUK decides.`;

  try {
    const answer = await askAi({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 400,
    });
    return screenNarrative(answer.text);
  } catch (err) {
    // A missing paragraph is a much smaller loss than a failed check list.
    console.error("[coach] narrative unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * POST /api/assistant/brief-coach — checks a half-filled brief against the real
 * zoning table. There is no project yet, so this takes the form's own values
 * rather than an id.
 */
export async function briefCoach(req: Request, res: Response) {
  const parsed = coachSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const input = parsed.data;

  const zoneDoc = await findZoneForArea(input.areaName);
  const katha = input.landAreaKatha ?? 0;
  const floors = input.floors ?? 0;
  const plotSqm = katha * KATHA_TO_SQM;

  // The same two lines the brief form already shows: FAR is the multiple of the
  // plot you may build in total, coverage caps what the building may sit on.
  const maxFloorAreaSqm = zoneDoc && katha > 0 ? zoneDoc.maxFar * plotSqm : null;
  const maxFootprintSqm =
    zoneDoc && katha > 0 ? (zoneDoc.maxGroundCoveragePct / 100) * plotSqm : null;
  const perFloorSqm = maxFloorAreaSqm != null && floors > 0 ? maxFloorAreaSqm / floors : null;

  const checks: BriefCheck[] = [];

  if (!zoneDoc) {
    checks.push({
      id: "NO_ZONE_RECORD",
      severity: "warning",
      text: `Buildora has no DAP zone record for ${input.areaName} yet, so its FAR and coverage limits can't be checked. You can still post the brief.`,
    });
  } else {
    if (zoneDoc.maxFloors && floors > zoneDoc.maxFloors) {
      checks.push({
        id: "OVER_FLOOR_LIMIT",
        severity: "blocker",
        text: `You've planned ${floors} floors, but ${zoneDoc.zoneCode} allows at most ${zoneDoc.maxFloors}. RAJUK would refuse this as it stands.`,
      });
    }
    // BuildingType and LandUse are separate enums that happen to share three
    // values (RESIDENTIAL, COMMERCIAL, MIXED_USE) — LandUse also has INDUSTRIAL
    // and INSTITUTIONAL, which nothing may be built as. Comparing the strings is
    // what the brief form's zone card already does.
    if (input.buildingType && String(input.buildingType) !== String(zoneDoc.landUse)) {
      checks.push({
        id: "USE_MISMATCH",
        severity: "warning",
        text: `This zone is ${zoneDoc.landUse.toLowerCase().replace(/_/g, " ")}, but you've chosen a ${input.buildingType.toLowerCase().replace(/_/g, " ")} building. That needs a change-of-use approval.`,
      });
    }
  }

  // A brief nobody can price is a brief nobody proposes on.
  if (!input.description || input.description.trim().length < 80) {
    checks.push({
      id: "THIN_DESCRIPTION",
      severity: "warning",
      text: "The description is very short. Architects use it to judge whether the job suits them, so say what the building is for, who will live in it, and anything unusual about the plot.",
    });
  }
  if (!input.budgetMinBdt && !input.budgetMaxBdt) {
    checks.push({
      id: "NO_BUDGET",
      severity: "warning",
      text: "No budget range is set. Without one you'll get proposals priced all over the place, and comparing them is guesswork.",
    });
  }

  // One car per unit is the rule of thumb RAJUK works to for apartments.
  const units = (input.unitsPerFloor ?? 0) * floors;
  if (units > 0 && (input.parkingSpaces ?? 0) < units) {
    checks.push({
      id: "PARKING_SHORT",
      severity: "warning",
      text: `You've planned ${units} units but only ${input.parkingSpaces ?? 0} parking spaces. RAJUK generally expects about one per unit, so this may need reworking.`,
    });
  }

  if (floors >= 5 && !input.soilTestDone) {
    checks.push({
      id: "NO_SOIL_TEST",
      severity: "warning",
      text: `At ${floors} floors a soil test isn't optional — the structural engineer can't size the foundation without one, and much of Dhaka is reclaimed land.`,
    });
  }
  if (input.roadWidthFt != null && input.roadWidthFt > 0 && input.roadWidthFt < 12 && floors > 5) {
    checks.push({
      id: "NARROW_ROAD",
      severity: "warning",
      text: `A ${input.roadWidthFt} ft access road is narrow for a ${floors}-storey building. Road width affects both the permitted height and fire access.`,
    });
  }
  if (!input.ownershipDocsReady) {
    checks.push({
      id: "NO_OWNERSHIP_DOCS",
      severity: "tip",
      text: "Ownership documents aren't marked ready. They're needed before the RAJUK submission, so it's worth starting to gather them now.",
    });
  }

  // Indicative permit fee, from the same admin table the fee calculator uses.
  let permitFeeBdt: number | null = null;
  if (zoneDoc && maxFloorAreaSqm != null) {
    const rule = await FeeRule.findOne({ category: zoneDoc.landUse });
    if (rule) {
      permitFeeBdt = rule.baseFeeBdt + Math.round(rule.ratePerSqmBdt * maxFloorAreaSqm);
    }
  }

  const result: BriefCoachResult = {
    zone: zoneDoc
      ? {
          zoneCode: zoneDoc.zoneCode,
          areaName: zoneDoc.areaName,
          landUse: zoneDoc.landUse,
          maxFar: zoneDoc.maxFar,
          maxGroundCoveragePct: zoneDoc.maxGroundCoveragePct,
          ...(zoneDoc.maxFloors ? { maxFloors: zoneDoc.maxFloors } : {}),
        }
      : null,
    plotSqm: Math.round(plotSqm * 10) / 10,
    maxFloorAreaSqm: maxFloorAreaSqm != null ? Math.round(maxFloorAreaSqm * 10) / 10 : null,
    maxFootprintSqm: maxFootprintSqm != null ? Math.round(maxFootprintSqm * 10) / 10 : null,
    perFloorSqm: perFloorSqm != null ? Math.round(perFloorSqm * 10) / 10 : null,
    permitFeeBdt,
    checks,
    narrative: null,
  };

  result.narrative = await narrate(input, result);
  return res.json({ data: { coach: result } });
}

/* ---------------------------------------------------- Proposal drafter ---- */

const draftSchema = z.object({
  // The only thing the client chooses. No free text is accepted: everything the
  // letter is built from already lives in the database, so there is nothing for
  // a caller to inject through.
  tone: z.enum(["formal", "warm"]).default("formal"),
});

/**
 * POST /api/projects/:id/proposal-draft — a first draft of an architect's
 * cover letter, written from the brief and their own stored portfolio.
 *
 * It is a draft in the real sense: it lands in the pitch form as editable text
 * and nothing is submitted. The architect still writes the fee and still presses
 * send.
 *
 * Unlike the coach and the digest there is no deterministic fallback here — the
 * whole output is prose, so a model failure is a 502 rather than a thinner
 * result. That is the honest behaviour: there is no letter without a writer.
 */
export async function draftProposal(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  // Architects propose on open briefs. If they can't see it, it isn't there.
  if (!canViewProject(project, req.auth!)) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }
  if (project.status !== ProjectStatus.BRIEF_POSTED) {
    return res
      .status(400)
      .json({ error: { message: "This brief isn't open for proposals right now" } });
  }

  // Mirrors the partial unique index on Proposal: one live pitch per architect.
  const existing = await Proposal.findOne({
    project: project._id,
    architect: req.auth!.sub,
    status: { $in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
  });
  if (existing) {
    return res
      .status(409)
      .json({ error: { message: "You already have a proposal on this brief" } });
  }

  const parsed = draftSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  if (!isAiConfigured()) {
    return res
      .status(503)
      .json({ error: { message: "The proposal drafter isn't configured (no model API key set)" } });
  }

  const architect = await User.findById(req.auth!.sub);
  if (!architect) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  // Their own record, so it needs no fencing — but it is still trimmed, because
  // a long portfolio would crowd out the brief itself.
  //
  // UserProfile is a union of the land-owner and professional shapes. The route
  // is behind requireRole(ARCHITECT), so this is the professional half; the
  // narrowing is what lets us read portfolio and credentials off it.
  const profile = architect.profile as ProfessionalProfile | undefined;
  const portfolio = (profile?.portfolio ?? []).slice(0, 4);
  const usedPortfolioTitles = portfolio.map((p) => p.title).filter(Boolean);

  const credentials = [
    profile?.professionalTitle,
    profile?.company,
    profile?.yearsExperience ? `${profile.yearsExperience} years in practice` : "",
    // specialties is a free-text field, not a list.
    profile?.specialties ? `specialises in ${profile.specialties}` : "",
    profile?.expertise?.length ? `expertise: ${profile.expertise.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const portfolioLines = portfolio.length
    ? portfolio
        .map(
          (p) =>
            `- ${p.title}${p.location ? ` (${p.location})` : ""}${p.buildingType ? `, ${p.buildingType}` : ""}${p.description ? `: ${p.description.slice(0, 200)}` : ""}`
        )
        .join("\n")
    : "(no portfolio entries on file)";

  const zone = await findZoneForArea(project.areaName);

  const prompt = `You are ${architect.name}, an architect in Bangladesh, writing a cover letter to bid on a project brief.

THE BRIEF (written by the land owner):
Title: ${project.title}
Location: ${project.areaName}
Plot: ${project.landAreaKatha} katha, ${project.floors} floors, ${project.buildingType}
${project.budgetMinBdt || project.budgetMaxBdt ? `Budget: ${project.budgetMinBdt ?? "?"} to ${project.budgetMaxBdt ?? "?"} BDT` : "Budget: not stated"}
${project.unitsPerFloor ? `Units per floor: ${project.unitsPerFloor}` : ""}
${project.bedroomsPerUnit ? `Bedrooms per unit: ${project.bedroomsPerUnit}` : ""}
${project.designStyle ? `Preferred style: ${project.designStyle}` : ""}
${zone ? `The plot sits in DAP zone ${zone.zoneCode}: max FAR ${zone.maxFar}, max ground coverage ${zone.maxGroundCoveragePct}%${zone.maxFloors ? `, max ${zone.maxFloors} floors` : ""}.` : ""}

${project.description?.trim() ? fenced("the owner's description", sanitizeForPrompt(project.description, TRUNCATE.projectDescription)) : ""}

YOUR OWN BACKGROUND (from your Buildora profile — use only what is here):
${credentials || "(no credentials on file)"}
Past work:
${portfolioLines}

Write the cover letter, 150 to 220 words, ${parsed.data.tone === "warm" ? "warm and personal but professional" : "professional and measured"}. Plain text, no markdown, no headings, no subject line, no signature block.

Rules:
- Refer only to past work listed above. Never invent a project, an award, or a client.
- Show you have read the brief: name something specific about this plot or these requirements.
- Do not state a fee or a timeline — those are entered separately on the form.
- Do not promise permit approval. Do not use the words "guaranteed" or "final".
- Write as the architect, in the first person.`;

  try {
    const answer = await askAi({ messages: [{ role: "user", content: prompt }], maxTokens: 500 });
    // Unlike the coach's narrative, this letter *is* the whole response — there
    // is nothing to fall back to — so a dropped draft is an error, not a quiet
    // omission.
    const letter = screenNarrative(answer.text);
    if (!letter) throw new Error("Couldn't draft the letter, try again");
    return res.json({
      data: { draft: { coverLetter: letter, usedPortfolioTitles } },
    });
  } catch (err) {
    return res.status(502).json({
      error: { message: err instanceof Error ? err.message : "Couldn't draft the letter" },
    });
  }
}
