import type { Request, Response } from "express";
import { z } from "zod";
import { UserRole, VerificationStatus } from "@buildora/shared";
import { env } from "../config/env";
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
});

/**
 * The assistant's grounding: fixed platform knowledge plus live numbers and
 * the admin-editable permit tables read from MongoDB on every request — so
 * its answers track whatever the supervisor last saved, never a hardcoded
 * copy.
 */
async function buildSystemPrompt(role?: UserRole) {
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
    : "(no zones loaded yet — tell users the zone checker data is being added)";

  const feeLines = fees.length
    ? fees
        .map(
          (f) =>
            `- ${f.label} (${f.category}): base ৳${f.baseFeeBdt} + ৳${f.ratePerSqmBdt} per sqm of floor area`
        )
        .join("\n")
    : "(no fee rules loaded yet — tell users the fee calculator data is being added)";

  return `You are the Buildora Guide — the assistant for Buildora, a construction platform for Bangladesh that connects land owners with verified architects, structural engineers, contractors, and material suppliers.

How Buildora works:
- A land owner posts a project brief (location, land size, floors, budget) at /projects/new.
- Verified architects browse briefs at /briefs and send proposals; the owner can also browse portfolios at /architects.
- When both sides agree, a contract is made and the fee goes into escrow (bKash, Nagad, or bank). Money releases only at approved milestones — up to 3 design revision rounds are included.
- The platform guides the RAJUK building-permit process: DAP zone checks and fee estimates at /permits, plus an ECPS submission tracker. Buildora guides and tracks ECPS but does not replace it.
- Professionals sign up at /auth (Professional tab), complete their profile at /profile/professional, and request verification. A human supervisor reviews NID, IAB/IEB membership, and RAJUK enlistment before awarding the "Platform Verified" badge.

Live platform data (from the database, current as of this message):
- Verified architects on the platform right now: ${architectCount}
- DAP zone records (admin-maintained):
${zoneLines}
- RAJUK fee rules (admin-maintained):
${feeLines}

${role ? `The person you're talking to is signed in as: ${role}.` : "The person you're talking to is a guest (not signed in)."}

Rules:
- Only answer questions about Buildora, building/construction in Bangladesh, RAJUK/DAP/ECPS permits, or choosing professionals. For anything else, say you only help with Buildora and building topics.
- Be concise — a short paragraph or a few bullet points. Plain text only, no markdown headings or bold.
- When a page helps, mention its path (e.g. "post a brief at /projects/new").
- Quote fees and zone limits only from the data above; if the data says it's not loaded, say so instead of inventing numbers.
- Reply in Bangla if the user writes in Bangla.
- Never promise approval outcomes or legal results — Buildora guides the process, RAJUK decides.`;
}

/** Calls Gemini's generateContent REST endpoint with plain fetch. */
async function askGemini(
  systemPrompt: string,
  contents: { role: "user" | "model"; parts: { text: string }[] }[]
) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 2500 },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[assistant] Gemini ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(res.status === 429 ? "The assistant is busy — try again in a minute" : "The assistant couldn't answer just now");
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const reply = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!reply) throw new Error("The assistant couldn't answer just now");
  return reply.trim();
}

/**
 * POST /api/assistant/chat — one question in, one answer out. Guests send
 * their own history; signed-in users' conversation is loaded from and saved
 * back to MongoDB.
 */
export async function chat(req: Request, res: Response) {
  if (!env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: { message: "The assistant isn't configured (missing Gemini key)" },
    });
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { message, history } = parsed.data;

  // Signed-in users: history comes from their stored conversation.
  const stored = req.auth ? await AssistantChat.findOne({ user: req.auth.sub }) : null;
  const past = (stored ? stored.messages.slice(-HISTORY_LIMIT) : history).map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const systemPrompt = await buildSystemPrompt(req.auth?.role);

  let reply: string;
  try {
    reply = await askGemini(systemPrompt, [...past, { role: "user", parts: [{ text: message }] }]);
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

  return res.json({ data: { reply } });
}

/** GET /api/assistant/chat — the signed-in user's stored conversation. */
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
