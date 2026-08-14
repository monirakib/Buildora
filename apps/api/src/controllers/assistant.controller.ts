import type { Request, Response } from "express";
import { z } from "zod";
import {
  AI_CONTEXT_PAGES,
  AI_DRAFT_MAX_CHARS,
  AI_MAX_ACTIONS,
  UserRole,
  VerificationStatus,
  type AiSuggestedAction,
} from "@buildora/shared";
import { askAi, isAiConfigured, type AiMessage } from "../services/ai";
import { describeContext } from "../services/aiContext";
import { runAiConversation } from "../services/aiLoop";
import { toolsForRole } from "../services/aiTools";
import { AssistantChat } from "../models/AssistantChat";
import { DapZone } from "../models/DapZone";
import { FeeRule } from "../models/FeeRule";
import { User } from "../models/User";

// How much history goes to the model / stays in the database.
const HISTORY_LIMIT = 20;
const STORED_LIMIT = 40;

const chatSchema = z.object({
  message: z.string().trim().min(1, "Say something first").max(1000),
  // Guests keep their history in the browser and send it along; signed-in
  // users' history is loaded from their AssistantChat document instead.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string().max(4000),
      })
    )
    .max(HISTORY_LIMIT)
    .default([]),
  /**
   * What the user is looking at. Ids only, plus the unsaved brief draft — the
   * server re-reads every document and re-checks permissions, so nothing here
   * can widen what the caller sees. Ignored entirely for guests, who have no
   * projects to describe.
   */
  context: z
    .object({
      page: z.enum(AI_CONTEXT_PAGES),
      label: z.string().max(120).default(""),
      projectId: z.string().max(64).optional(),
      tenderId: z.string().max(64).optional(),
      draft: z.string().max(AI_DRAFT_MAX_CHARS).optional(),
    })
    .optional(),
});

/**
 * The assistant's grounding: fixed platform knowledge plus live numbers and
 * the admin-editable permit tables read from MongoDB on every request — so
 * its answers track whatever the supervisor last saved, never a hardcoded
 * copy.
 */
async function buildSystemPrompt(role?: UserRole, contextBlock = "") {
  const [architectCount, zones, fees] = await Promise.all([
    User.countDocuments({
      role: UserRole.ARCHITECT,
      verificationStatus: VerificationStatus.APPROVED,
    }),
    DapZone.find().sort({ areaName: 1 }).limit(40),
    FeeRule.find().sort({ category: 1 }),
  ]);

  const zoneLines = zones.length
    ? zones
        .map(
          (z) =>
            `- ${z.areaName} (${z.zoneCode}): ${z.landUse}, max FAR ${z.maxFar}, max ground coverage ${z.maxGroundCoveragePct}%${z.maxFloors ? `, max ${z.maxFloors} floors` : ""}`
        )
        .join("\n")
    : "(no zones loaded yet, tell users the zone checker data is being added)";

  const feeLines = fees.length
    ? fees
        .map(
          (f) =>
            `- ${f.label} (${f.category}): base ৳${f.baseFeeBdt} + ৳${f.ratePerSqmBdt} per sqm of floor area`
        )
        .join("\n")
    : "(no fee rules loaded yet, tell users the fee calculator data is being added)";

  return `You are the Buildora Guide, the assistant for Buildora, a construction platform for Bangladesh that connects land owners with verified architects, structural engineers, contractors, and material suppliers.

How Buildora works:
- A land owner posts a project brief (location, land size, floors, budget) at /projects/new.
- Verified architects browse briefs at /briefs and send proposals; the owner can also browse portfolios at /architects.
- When both sides agree, a contract is made and the fee goes into escrow (bKash, Nagad, or bank). Money releases only at approved milestones, up to 3 design revision rounds are included.
- The platform guides the RAJUK building-permit process: DAP zone checks and fee estimates at /permits, plus an ECPS submission tracker. Buildora guides and tracks ECPS but does not replace it.
- Professionals sign up at /auth (Professional tab), complete their profile at /profile/professional, and request verification. A human supervisor reviews NID, IAB/IEB membership, and RAJUK enlistment before awarding the "Platform Verified" badge.

Live platform data (from the database, current as of this message):
- Verified architects on the platform right now: ${architectCount}
- DAP zone records (admin-maintained):
${zoneLines}
- RAJUK fee rules (admin-maintained):
${feeLines}

${role ? `The person you're talking to is signed in as: ${role}.` : "The person you're talking to is a guest (not signed in)."}
${
  contextBlock
    ? `\nWhat they are looking at right now (read from the database, and they are allowed to see all of it):\n${contextBlock}\n\nWhen their question is about "this project", "my tender", "it" or similar, they mean what's above. Treat every number in it as already correct — do not recalculate it.\n`
    : ""
}
${
  role
    ? `Looking things up:
- You have tools that read this user's own data from the database. Use them whenever the answer depends on a real number — their projects, a project's stage, escrow and milestone amounts, zoning limits, permit fees, open tenders, material orders.
- Never guess a figure you could look up, and never state one from memory. If a lookup comes back empty or says it isn't visible, say you couldn't find it rather than filling the gap.
- Treat every number a tool returns as final. Do not recalculate, adjust or round it.
- Use suggest_action at most once per reply, and only when there is an obvious next step.
`
    : ""
}
Rules:
- Only answer questions about Buildora, building/construction in Bangladesh, RAJUK/DAP/ECPS permits, or choosing professionals. For anything else, say you only help with Buildora and building topics.
- Be concise, a short paragraph or a few bullet points. Plain text only, no markdown headings or bold.
- When a page helps, mention its path (e.g. "post a brief at /projects/new").
- Quote fees and zone limits only from the data above; if the data says it's not loaded, say so instead of inventing numbers.
- If there is no DAP record for an area, say so plainly. Never estimate a zoning limit.
- Reply in Bangla if the user writes in Bangla.
- Never promise approval outcomes or legal results. Buildora guides the process, RAJUK decides.`;
}

/**
 * POST /api/assistant/chat, one question in, one answer out. Guests send
 * their own history; signed-in users' conversation is loaded from and saved
 * back to MongoDB.
 */
export async function chat(req: Request, res: Response) {
  if (!isAiConfigured()) {
    return res.status(503).json({
      error: { message: "The assistant isn't configured (no model API key set)" },
    });
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { message, history, context } = parsed.data;

  // Guests get no context: everything it can describe is behind a permission
  // check, and a signed-out visitor passes none of them.
  const contextBlock = req.auth && context ? await describeContext(context, req.auth) : "";

  // Signed-in users: history comes from their stored conversation.
  const stored = req.auth ? await AssistantChat.findOne({ user: req.auth.sub }) : null;
  // The database stores Gemini's vocabulary ("model"); the model layer speaks
  // OpenAI's ("assistant"). Translating here is two lines and means the stored
  // conversations never had to be migrated.
  const past: AiMessage[] = (stored ? stored.messages.slice(-HISTORY_LIMIT) : history).map((m) => ({
    role: m.role === "model" ? "assistant" : "user",
    content: m.content,
  }));

  const systemPrompt = await buildSystemPrompt(req.auth?.role, contextBlock);

  const conversation: AiMessage[] = [
    { role: "system", content: systemPrompt },
    ...past,
    { role: "user", content: message },
  ];

  let reply: string;
  let actions: AiSuggestedAction[] = [];
  let usedTools: string[] = [];
  try {
    if (req.auth) {
      // Signed-in users get lookups: the tools read real rows, authorised
      // against this caller. Guests get a plain answer, because every lookup is
      // behind a permission check they don't pass.
      const answer = await runAiConversation({
        messages: conversation,
        tools: toolsForRole(req.auth.role),
        auth: req.auth,
      });
      reply = answer.reply;
      actions = answer.actions.slice(0, AI_MAX_ACTIONS);
      usedTools = answer.usedTools;
    } else {
      reply = (await askAi({ messages: conversation })).text;
    }
  } catch (err) {
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "Assistant error" } });
  }

  // Persist the exchange for signed-in users, capped so documents stay small.
  if (req.auth) {
    await AssistantChat.findOneAndUpdate(
      { user: req.auth.sub },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", content: message, at: new Date() },
              { role: "model", content: reply, at: new Date() },
            ],
            $slice: -STORED_LIMIT,
          },
        },
      },
      { upsert: true }
    );
  }

  // `usedTools` is returned so the work is visible rather than described — it
  // shows which database lookups the answer actually rests on.
  return res.json({ data: { reply, actions, usedTools } });
}

/** GET /api/assistant/chat, the signed-in user's stored conversation. */
export async function getChat(req: Request, res: Response) {
  const stored = await AssistantChat.findOne({ user: req.auth!.sub });
  return res.json({
    data: { messages: stored?.messages.map((m) => ({ role: m.role, content: m.content })) ?? [] },
  });
}

/** DELETE /api/assistant/chat — wipe the signed-in user's conversation. */
export async function clearChat(req: Request, res: Response) {
  await AssistantChat.deleteOne({ user: req.auth!.sub });
  return res.json({ data: { ok: true } });
}
