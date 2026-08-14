import { UserRole, TenderStatus, type AiChatContext } from "@buildora/shared";
import type { AuthPayload } from "../middleware/auth";
import { Project } from "../models/Project";
import { Tender } from "../models/Tender";
import { Contract } from "../models/Contract";
import { Milestone } from "../models/Milestone";
import { canViewProject } from "../controllers/projects.controller";
import { findZoneForArea } from "./dapZones";
import { fenced, sanitizeForPrompt, TRUNCATE } from "./aiSafety";

/**
 * Turning "what the user is looking at" into grounding the model can use.
 *
 * The browser sends ids. This loads the documents behind them, checks the
 * caller is allowed to see each one using the *same* predicate the ordinary
 * page uses, and writes a short factual block. The model gets facts already
 * settled, never raw permission to go looking.
 *
 * When a check fails this returns an empty string — not an error, not a
 * message. "You can't see that project" would confirm the project exists, which
 * is a question nobody has the right to ask. An empty block is exactly what the
 * assistant has on any page that registers nothing, so a denied lookup and a
 * nonexistent id are indistinguishable.
 */

async function describeProject(projectId: string, auth: AuthPayload): Promise<string> {
  const project = await Project.findById(projectId).catch(() => null);
  if (!project || !canViewProject(project, auth)) return "";

  const lines: string[] = [
    // The id is here so the model can name this project when it calls a tool.
    // Without it the lookups are unreachable for the very project the user is
    // looking at, which is the one they are almost always asking about.
    `Project id: ${project._id.toString()}`,
    `Project: ${project.title}`,
    `Location: ${project.areaName}`,
    `Status: ${project.status}`,
    `Plot: ${project.landAreaKatha} katha, ${project.floors} floors planned, ${project.buildingType}`,
  ];

  if (project.budgetMinBdt || project.budgetMaxBdt) {
    lines.push(`Budget: ${project.budgetMinBdt ?? "?"} to ${project.budgetMaxBdt ?? "?"} BDT`);
  }

  // The zone limits the owner is actually bound by, read from the same
  // admin-maintained table the permit tools use.
  const zone = await findZoneForArea(project.areaName);
  lines.push(
    zone
      ? `DAP zone: ${zone.areaName} (${zone.zoneCode}), ${zone.landUse}, max FAR ${zone.maxFar}, max ground coverage ${zone.maxGroundCoveragePct}%${zone.maxFloors ? `, max ${zone.maxFloors} floors` : ""}`
      : `DAP zone: Buildora has no zone record for ${project.areaName}.`
  );

  // Where the money and the work have actually got to.
  const [contract, milestones] = await Promise.all([
    Contract.findOne({ project: project._id }),
    Milestone.find({ project: project._id }).sort({ order: 1 }),
  ]);

  if (contract) {
    lines.push(
      `Design contract: ${contract.status}, concept fee ${contract.conceptFeeBdt} BDT, design fee ${contract.designFeeBdt} BDT, revisions used ${contract.revisionsUsed} of ${contract.maxRevisions}`
    );
  } else {
    lines.push("Design contract: none yet.");
  }

  if (milestones.length) {
    const tally = new Map<string, number>();
    for (const m of milestones) tally.set(m.status, (tally.get(m.status) ?? 0) + 1);
    const summary = [...tally.entries()].map(([status, n]) => `${n} ${status}`).join(", ");
    lines.push(`Construction milestones: ${milestones.length} total (${summary}).`);
  }

  if (project.description?.trim()) {
    lines.push(
      fenced(
        "project description",
        sanitizeForPrompt(project.description, TRUNCATE.projectDescription)
      )
    );
  }

  return lines.join("\n");
}

async function describeTender(tenderId: string, auth: AuthPayload): Promise<string> {
  const tender = await Tender.findById(tenderId).catch(() => null);
  if (!tender) return "";

  const ownerId = String((tender.owner as { _id?: unknown })._id ?? tender.owner);
  const isOwner = ownerId === auth.sub || auth.role === UserRole.ADMIN;

  // Mirrors getTender: a draft is invisible to everyone but its owner, and only
  // contractors have any business reading a published one.
  if (tender.status === TenderStatus.DRAFT && !isOwner) return "";
  if (!isOwner && auth.role !== UserRole.CONTRACTOR) return "";

  const lines: string[] = [
    `Tender id: ${tender._id.toString()}`,
    `Tender: ${tender.title}`,
    `Status: ${tender.status}`,
    `Bidding deadline: ${tender.deadlineAt.toISOString()}`,
    `Bill of Quantities: ${tender.items.length} line items`,
  ];

  // guideRateBdt and estimatedBdt are the owner's own working numbers. Showing
  // them to a bidder would anchor every bid to them, which is the whole reason
  // toTenderDto strips them — so they only appear here for the owner.
  if (isOwner && tender.estimatedBdt) {
    lines.push(`Owner's own estimate from the guide rates: ${tender.estimatedBdt} BDT`);
  }

  if (tender.scope?.trim()) {
    lines.push(fenced("tender scope", sanitizeForPrompt(tender.scope, TRUNCATE.tenderScope)));
  }

  return lines.join("\n");
}

/**
 * The grounding block for one request, or "" when there is nothing useful (or
 * nothing permitted) to say.
 */
export async function describeContext(context: AiChatContext, auth: AuthPayload): Promise<string> {
  switch (context.page) {
    case "project":
      return context.projectId ? describeProject(context.projectId, auth) : "";

    case "tender":
      return context.tenderId ? describeTender(context.tenderId, auth) : "";

    case "brief-form": {
      // Nothing to load: this brief doesn't exist yet. The draft is the only
      // case where data rather than an id crosses the wire, so it is fenced.
      if (!context.draft?.trim())
        return "The user is filling in a new project brief at /projects/new.";
      const draft = sanitizeForPrompt(context.draft, TRUNCATE.draft);
      const lines = [
        "The user is filling in a new project brief at /projects/new. This is what they have typed so far:",
        fenced("draft brief", draft),
      ];
      // If they've named an area, the zone limits are settled fact worth adding.
      const areaLine = /Area:\s*(.+)/i.exec(draft);
      if (areaLine?.[1]) {
        const zone = await findZoneForArea(areaLine[1].trim());
        lines.push(
          zone
            ? `DAP zone for ${zone.areaName} (${zone.zoneCode}): ${zone.landUse}, max FAR ${zone.maxFar}, max ground coverage ${zone.maxGroundCoveragePct}%${zone.maxFloors ? `, max ${zone.maxFloors} floors` : ""}`
            : `Buildora has no DAP zone record for that area, so do not state a limit for it.`
        );
      }
      return lines.join("\n");
    }

    // The rest just orient the assistant. No database read, because there is no
    // single record these pages are about.
    case "permits":
      return "The user is on the permit tools page (/permits), with the DAP zone checker, the RAJUK fee calculator and the ECPS guide.";
    case "briefs":
      return "The user is browsing open project briefs at /briefs.";
    case "diary":
      return "The user is looking at a construction site diary.";
    case "marketplace":
      return "The user is browsing building materials at /marketplace.";
    case "other":
    default:
      return "";
  }
}
