import {
  AI_ACTION_LABELS,
  ESTIMATE_TIER_LABELS,
  LandUse,
  ProjectStatus,
  TenderStatus,
  UserRole,
  type AiActionKey,
  type AiSuggestedAction,
} from "@buildora/shared";
import type { AuthPayload } from "../middleware/auth";
import type { AiTool } from "./aiLoop";
import { Project } from "../models/Project";
import { Tender } from "../models/Tender";
import { Bid } from "../models/Bid";
import { Milestone } from "../models/Milestone";
import { BuildContract } from "../models/BuildContract";
import { MarketOrder } from "../models/MarketOrder";
import { FeeRule } from "../models/FeeRule";
import { CostEstimateSnapshot } from "../models/CostEstimateSnapshot";
import { canViewProject } from "../controllers/projects.controller";
import { canViewBuild } from "../controllers/build.controller";
import { findZoneForArea } from "./dapZones";

/**
 * What the assistant is allowed to look up.
 *
 * One rule holds this together, and it is worth stating before the code:
 *
 *   **Every tool builds its query from the signed-in caller. None of them
 *   accept a user id, username or email as an argument.**
 *
 * The only ids a tool takes from the model are a projectId or a tenderId, and
 * each of those goes through the same permission check the ordinary HTTP
 * endpoint uses. So the worst a model can do — whether it's confused or has
 * been talked into something by text in a project description — is fetch
 * something the caller could already have fetched by clicking around the site.
 *
 * Nothing here writes. `suggest_action` looks like a write and isn't: it
 * records a button for the user to press, and the pressing happens in the
 * browser against the normal endpoint.
 *
 * Each `run` returns plain text rather than JSON. It's cheaper in tokens, it's
 * what the model actually reads, and the tool result has to be a string anyway.
 */

/** Money reads better to the model with a unit attached than as a bare number. */
function bdt(n: number | undefined): string {
  return n == null ? "not set" : `${n.toLocaleString("en-US")} BDT`;
}

/* ------------------------------------------------------------- projects ---- */

const listMyProjects: AiTool = {
  spec: {
    name: "list_my_projects",
    description:
      "List the projects the signed-in user is involved in, with their id, title, area and current stage. Use this when they ask about 'my projects' or refer to a project you don't have an id for.",
    parameters: { type: "object", properties: {} },
  },
  async run(_args, auth) {
    // The same filter listMyProjects uses: owners by ownership, professionals
    // by whichever slot they occupy on the project.
    const filter =
      auth.role === UserRole.LAND_OWNER
        ? { owner: auth.sub }
        : auth.role === UserRole.STRUCTURAL_ENGINEER
          ? { engineer: auth.sub }
          : auth.role === UserRole.CONTRACTOR
            ? { contractor: auth.sub }
            : { architect: auth.sub };

    const docs = await Project.find(filter).sort({ createdAt: -1 }).limit(10);
    if (docs.length === 0) return "This user has no projects yet.";

    return docs
      .map(
        (p) =>
          `id ${p._id.toString()} | ${p.title} | ${p.areaName} | ${p.status} | ${p.floors} floors, ${p.landAreaKatha} katha`
      )
      .join("\n");
  },
};

const getProjectStatus: AiTool = {
  spec: {
    name: "get_project_status",
    description:
      "Read one project's stage, plot details, budget and design-contract position. Needs the project's id.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "The project's id" } },
      required: ["projectId"],
    },
  },
  async run(args, auth) {
    const { projectId } = args as { projectId?: string };
    if (!projectId) return "No project id was given.";

    const project = await Project.findById(projectId).catch(() => null);
    if (!project || !canViewProject(project, auth)) {
      return "No project with that id is visible to you.";
    }

    const lines = [
      `Title: ${project.title}`,
      `Area: ${project.areaName}`,
      `Stage: ${project.status}`,
      `Plot: ${project.landAreaKatha} katha, ${project.floors} floors, ${project.buildingType}`,
      `Budget: ${bdt(project.budgetMinBdt)} to ${bdt(project.budgetMaxBdt)}`,
      `Soil test done: ${project.soilTestDone ? "yes" : "no"}`,
      `Ownership documents ready: ${project.ownershipDocsReady ? "yes" : "no"}`,
    ];

    const tender = await Tender.findOne({ project: project._id });
    lines.push(tender ? `Tender: ${tender.status}` : "Tender: none created yet.");

    return lines.join("\n");
  },
};

/* --------------------------------------------------------------- permits ---- */

const lookupDapZone: AiTool = {
  spec: {
    name: "lookup_dap_zone",
    description:
      "Look up the RAJUK DAP zoning limits for an area of Dhaka: maximum FAR, maximum ground coverage and maximum floors. Use this before saying anything about what may be built on a plot.",
    parameters: {
      type: "object",
      properties: { area: { type: "string", description: "Area name, e.g. Dhanmondi" } },
      required: ["area"],
    },
  },
  // The zone table is public — the same data /permits shows to signed-out
  // visitors — so there is nothing to gate here.
  async run(args) {
    const { area } = args as { area?: string };
    if (!area) return "No area was given.";

    const zone = await findZoneForArea(area);
    if (!zone) return `Buildora has no DAP record for ${area}. Say so; do not estimate a limit.`;

    return [
      `Zone: ${zone.areaName} (${zone.zoneCode})`,
      `Land use: ${zone.landUse}`,
      `Max FAR: ${zone.maxFar}`,
      `Max ground coverage: ${zone.maxGroundCoveragePct}%`,
      zone.maxFloors ? `Max floors: ${zone.maxFloors}` : "Max floors: not specified",
      zone.notes ? `Notes: ${zone.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

const estimateRajukFee: AiTool = {
  spec: {
    name: "estimate_rajuk_fee",
    description:
      "Calculate the RAJUK permit fee for a floor area from the platform's fee table. Returns the finished total — do not multiply anything yourself.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: Object.values(LandUse),
          description: "Land-use category",
        },
        floorAreaSqm: { type: "number", description: "Proposed floor area in square metres" },
      },
      required: ["category", "floorAreaSqm"],
    },
  },
  async run(args) {
    const { category, floorAreaSqm } = args as { category?: string; floorAreaSqm?: number };
    if (!category || !floorAreaSqm || floorAreaSqm <= 0) {
      return "A land-use category and a positive floor area are both needed.";
    }

    // Arguments arrive as whatever the model wrote, so the category is checked
    // against the real enum rather than trusted into a query.
    const landUse = Object.values(LandUse).find((v) => v === category);
    if (!landUse) {
      return `${category} isn't a land-use category. Valid ones: ${Object.values(LandUse).join(", ")}.`;
    }

    const rule = await FeeRule.findOne({ category: landUse });
    if (!rule) return `No fee rate is configured for ${category} yet.`;

    // The arithmetic happens here, in TypeScript, exactly as the fee calculator
    // endpoint does it. The model is handed the answer, never the multiplication.
    const areaFeeBdt = Math.round(rule.ratePerSqmBdt * floorAreaSqm);
    const totalBdt = rule.baseFeeBdt + areaFeeBdt;

    return [
      `Category: ${landUse}, floor area ${floorAreaSqm} sqm`,
      `Base fee: ${bdt(rule.baseFeeBdt)}`,
      `Area fee: ${bdt(areaFeeBdt)} (${rule.ratePerSqmBdt} per sqm)`,
      `TOTAL: ${bdt(totalBdt)}`,
    ].join("\n");
  },
};

/* ---------------------------------------------------------------- money ---- */

const getEscrowStatus: AiTool = {
  spec: {
    name: "get_escrow_status",
    description:
      "Read the construction escrow position for a project: each milestone, its amount, its status and how much has been released.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "The project's id" } },
      required: ["projectId"],
    },
  },
  async run(args, auth) {
    const { projectId } = args as { projectId?: string };
    if (!projectId) return "No project id was given.";

    const contract = await BuildContract.findOne({ project: projectId }).catch(() => null);
    if (!contract || !canViewBuild(contract, auth)) {
      return "No build contract with that id is visible to you.";
    }

    const milestones = await Milestone.find({ buildContract: contract._id }).sort({ order: 1 });

    const lines = [
      `Contract sum: ${bdt(contract.contractSumBdt)}`,
      `Status: ${contract.status}`,
      `Released to contractor so far: ${bdt(contract.releasedToContractorBdt)}`,
      `Timeline: ${contract.timelineWeeks} weeks`,
      "Milestones:",
      ...milestones.map(
        (m) =>
          `  ${m.order}. ${m.title} — ${bdt(m.amountBdt)} (${m.amountPct}%) — ${m.status}${
            m.releasedAmountBdt ? `, released ${bdt(m.releasedAmountBdt)}` : ""
          }`
      ),
    ];

    if (milestones.length === 0) lines.push("  (none set up yet)");
    return lines.join("\n");
  },
};

const getCostEstimate: AiTool = {
  spec: {
    name: "get_cost_estimate",
    description:
      "Read the stored build cost estimate for a project: the range, what it was based on, and how accurate that makes it. Use this for any 'what will it cost' question.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string", description: "The project's id" } },
      required: ["projectId"],
    },
  },
  async run(args, auth) {
    const { projectId } = args as { projectId?: string };
    if (!projectId) return "No project id was given.";

    const project = await Project.findById(projectId).catch(() => null);
    if (!project || !canViewProject(project, auth)) {
      return "No project with that id is visible to you.";
    }

    const snapshot = await CostEstimateSnapshot.findOne({ project: project._id }).sort({
      createdAt: -1,
    });
    if (!snapshot) return "No cost estimate has been calculated for this project yet.";

    // Handed over exactly as stored. The model reports the range; it must not
    // pick a midpoint or re-derive anything from the line items.
    return [
      `Estimate range: ${bdt(snapshot.rangeLowBdt)} to ${bdt(snapshot.rangeHighBdt)}`,
      `Midpoint: ${bdt(snapshot.totalBdt)} (${bdt(snapshot.perSqftBdt)} per sqft over ${snapshot.areaSqft} sqft)`,
      `Based on: ${snapshot.areaSource}`,
      `Accuracy tier: ${ESTIMATE_TIER_LABELS[snapshot.tier]}`,
      `Calculated: ${snapshot.createdAt.toISOString().slice(0, 10)}`,
      "Always give the user the range, never the midpoint on its own — this is an estimate, not a quote.",
    ].join("\n");
  },
};

/* -------------------------------------------------------------- tenders ---- */

const listOpenTenders: AiTool = {
  spec: {
    name: "list_open_tenders",
    description: "List construction tenders currently open for bidding.",
    parameters: { type: "object", properties: {} },
  },
  roles: [UserRole.CONTRACTOR, UserRole.ADMIN],
  async run(_args, auth) {
    // Re-checked even though the tool isn't offered to other roles — a model
    // that invents the name still gets nowhere.
    if (auth.role !== UserRole.CONTRACTOR && auth.role !== UserRole.ADMIN) {
      return "Only contractors can browse tenders.";
    }

    // Same sweep the tender board does, so a tender past its deadline is never
    // advertised as biddable.
    await Tender.updateMany(
      { status: TenderStatus.OPEN, deadlineAt: { $lte: new Date() } },
      { status: TenderStatus.CLOSED }
    );

    const tenders = await Tender.find({ status: TenderStatus.OPEN })
      .sort({ deadlineAt: 1 })
      .limit(10);
    if (tenders.length === 0) return "No tenders are open for bidding right now.";

    const mine = await Bid.find({
      contractor: auth.sub,
      tender: { $in: tenders.map((t) => t._id) },
    }).select("tender");
    const bidOn = new Set(mine.map((b) => String(b.tender)));

    // Guide rates are the owner's private working numbers and are never listed.
    return tenders
      .map(
        (t) =>
          `id ${t._id.toString()} | ${t.title} | ${t.items.length} BOQ lines | closes ${t.deadlineAt.toISOString().slice(0, 10)}${
            bidOn.has(t._id.toString()) ? " | you have already bid" : ""
          }`
      )
      .join("\n");
  },
};

/* --------------------------------------------------------- marketplace ---- */

const listMyOrders: AiTool = {
  spec: {
    name: "list_my_orders",
    description:
      "List the signed-in user's material orders — what they bought if they're a buyer, what they sold if they're a supplier.",
    parameters: { type: "object", properties: {} },
  },
  async run(_args, auth) {
    // Buyers see what they bought; everyone else sees what they sold.
    const filter = auth.role === UserRole.LAND_OWNER ? { buyer: auth.sub } : { seller: auth.sub };

    const orders = await MarketOrder.find(filter).sort({ createdAt: -1 }).limit(10);
    if (orders.length === 0) return "No material orders yet.";

    return orders
      .map(
        (o) =>
          `${o.productSnapshot.name} × ${o.quantity} ${o.productSnapshot.unit} | ${bdt(o.totalBdt)} | ${o.status}`
      )
      .join("\n");
  },
};

/* ------------------------------------------------------ suggested action ---- */

/**
 * The only tool that produces something the user can act on, and it still
 * doesn't write anything. It validates that this caller may do the thing, then
 * records a button. Pressing it is the browser's job, against the endpoint that
 * already exists.
 */
const suggestAction: AiTool = {
  spec: {
    name: "suggest_action",
    description:
      "Offer the user a button for the obvious next step. Only call this when there is a clear one. OPEN_PROJECT and OPEN_DIARY need a projectId; POST_BRIEF needs the projectId of a draft the user owns.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: Object.keys(AI_ACTION_LABELS),
          description: "Which action to offer",
        },
        projectId: { type: "string", description: "Required for project-specific actions" },
      },
      required: ["action"],
    },
  },
  async run(args, auth, actions) {
    const { action, projectId } = args as { action?: string; projectId?: string };

    if (!action || !(action in AI_ACTION_LABELS)) {
      return "That action isn't available.";
    }
    const key = action as AiActionKey;

    // Which actions actually operate on a project. Anything else gets no
    // params at all, however much the model wanted to supply some — in testing
    // it cheerfully passed a project *title* as a projectId, and letting that
    // through would put junk in a URL.
    const NEEDS_PROJECT: AiActionKey[] = ["OPEN_PROJECT", "OPEN_DIARY", "POST_BRIEF"];
    const usesProject = NEEDS_PROJECT.includes(key);

    if (usesProject) {
      if (!projectId) return `${key} needs a projectId.`;

      // findById throws on a malformed id rather than returning null, so the
      // catch is what turns "not an id at all" into an ordinary refusal.
      const project = await Project.findById(projectId).catch(() => null);
      if (!project || !canViewProject(project, auth)) {
        return "That action isn't available to you.";
      }

      // Being able to see a brief is not the same as being able to publish it.
      // An admin can read every project on the platform and still must not post
      // somebody else's draft to the architect board.
      if (key === "POST_BRIEF") {
        const ownerId = String((project.owner as { _id?: unknown })._id ?? project.owner);
        if (ownerId !== auth.sub || project.status !== ProjectStatus.DRAFT) {
          return "That brief isn't yours to post, or it isn't a draft any more.";
        }
      }
    }

    actions.push({
      action: key,
      // The wording is ours. A model — or text a model was fed — never gets to
      // write what a button says.
      label: AI_ACTION_LABELS[key],
      ...(usesProject && projectId ? { params: { projectId } } : {}),
    });

    return "Button recorded. Tell the user in one short sentence what it will do.";
  },
};

/* ----------------------------------------------------------------- all ---- */

const ALL_TOOLS: AiTool[] = [
  listMyProjects,
  getProjectStatus,
  lookupDapZone,
  estimateRajukFee,
  getEscrowStatus,
  getCostEstimate,
  listOpenTenders,
  listMyOrders,
  suggestAction,
];

/**
 * The tools offered to one caller.
 *
 * Filtering here saves the model a wasted round trip asking for something it
 * can't have. It is not the security boundary — each `run` re-checks — but
 * belt and braces is the right posture when the thing being restrained is a
 * language model.
 */
export function toolsForRole(role: UserRole): AiTool[] {
  return ALL_TOOLS.filter((t) => !t.roles || t.roles.includes(role));
}

export type { AiSuggestedAction };
