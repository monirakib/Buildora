/**
 * Keeping the assistants on their subject.
 *
 * Buildora pays for its model calls out of two free-tier quotas, and every
 * assistant on the platform is pointed at one job: building, permits, and the
 * people who do that work. Left to a system prompt alone, a chat box on the
 * public internet becomes a free general-purpose AI — someone asks it for a
 * Python function, an essay, or its own instructions, and a helpful model
 * usually obliges. That costs us the quota and puts answers we never intended
 * to give under Buildora's name.
 *
 * The defence here is deliberately dumb and deterministic, in three layers:
 *
 *   1. screenPrompt — refuse the obvious misuse *before* a model call. Cheap,
 *      predictable, and explainable: it is a list of patterns.
 *   2. the system prompt (in each controller) — handles the fuzzy middle that
 *      no pattern list can catch.
 *   3. screenReply — a last look at what came back, because the model is the
 *      one part of this we do not control.
 *
 * None of this is a security boundary. What actually stops the assistant
 * leaking someone else's data is that every lookup it can perform authorises
 * against the signed-in caller (see aiTools.ts) and none of them write. This
 * file is about scope and quota, not permissions.
 */

/** What a screen decided. `reply` is what to say back when it refused. */
export type GuardVerdict = { ok: true } | { ok: false; category: string; reply: string };

/**
 * One refusal, used everywhere, in both languages the platform speaks. It says
 * what the assistant is for rather than scolding, because most of the people
 * who trip this are curious, not malicious.
 */
export const OFF_TOPIC_REPLY =
  "I only help with Buildora — building projects in Bangladesh, RAJUK and DAP permits, " +
  "escrow and contracts, and finding verified architects, engineers, contractors or " +
  "suppliers. Ask me something about your project and I'll help. " +
  "(আমি শুধু Buildora ও নির্মাণ সংক্রান্ত প্রশ্নে সাহায্য করি।)";

/**
 * The pattern list.
 *
 * Every entry has to be *high precision* — a false positive refuses a real
 * question from a real user, which is worse than letting an off-topic one
 * through to layer 2. That constraint is why some obvious-looking words are
 * missing on purpose:
 *
 * - "rust" is corrosion on rebar here, not a language.
 * - "react" is an ordinary English verb, so only "reactjs"/"react.js" match.
 * - "act as a…" is a normal construction question ("can an engineer act as a
 *   supervisor?"), so it only matches when an AI persona follows it.
 * - maths words like "calculate" and "estimate" are the assistant's actual job.
 */
const DENY: { category: string; patterns: RegExp[] }[] = [
  {
    // Using the assistant as a coding helper — the misuse we expect most.
    category: "code",
    patterns: [
      /\b(write|generate|create|give|show|fix|debug|refactor|complete|optimi[sz]e)\b[^.?!]{0,40}\b(code|function|snippet|script|program|algorithm|regex|sql query)\b/i,
      /\b(python|javascript|typescript|java|kotlin|swift|golang|php|c\+\+|c#|csharp|assembly language)\b/i,
      /\b(react\.?js|node\.?js|next\.?js|angular|jquery|django|flask|laravel|npm|yarn|docker|kubernetes|git (commit|merge|rebase))\b/i,
      /\b(leetcode|hackerrank|codeforces|stack ?overflow|stack ?trace|syntax error|segfault|null pointer|unit test)\b/i,
      /```/,
    ],
  },
  {
    // Trying to pull the instructions out, or talk it into a different persona.
    category: "jailbreak",
    patterns: [
      /\b(ignore|disregard|forget|override)\b[^.?!]{0,30}(previous|prior|above|earlier|all)?\s*(instruction|prompt|rule|guideline)/i,
      /\b(system|initial|original|hidden|your)\s+(prompt|instructions)\b/i,
      /\b(reveal|repeat|print|show|output)\b[^.?!]{0,30}\b(prompt|instructions|rules|everything above)\b/i,
      /\b(jailbreak|dan mode|developer mode|god mode|no restrictions|without any (rules|filters|restrictions)|unfiltered)\b/i,
      /\byou are (now|no longer)\b/i,
      /\b(pretend|roleplay|role-play)\b[^.?!]{0,20}\b(you are|to be|as)\b/i,
      /\bact as\b[^.?!]{0,30}\b(ai|an? assistant|bot|chatbot|model|chatgpt|gpt|claude|llama|gemini|hacker)\b/i,
      /\b(api[_ ]?key|secret key|env(ironment)? variable|\.env\b|database (password|credential))/i,
    ],
  },
  {
    // The general-purpose-AI requests: homework, creative writing, trivia.
    category: "off-topic",
    patterns: [
      /\b(write|draft|compose|generate)\b[^.?!]{0,30}\b(essay|poem|song|lyrics|story|joke|assignment|homework|thesis|blog post|tweet)\b/i,
      /\b(do|solve|answer)\b[^.?!]{0,20}\b(my|this) (homework|assignment|exam|quiz)\b/i,
      /\b(recipe for|medical advice|diagnos(e|is) my|who won the|movie recommendation|dating advice)\b/i,
    ],
  },
];

/**
 * Layer 1: look at what the user typed before spending a model call on it.
 *
 * A refusal here is free — no provider request, no quota — which is the second
 * reason it runs first.
 */
export function screenPrompt(text: string): GuardVerdict {
  for (const group of DENY) {
    if (group.patterns.some((p) => p.test(text))) {
      return { ok: false, category: group.category, reply: OFF_TOPIC_REPLY };
    }
  }
  return { ok: true };
}

/**
 * Layer 3: the reply itself.
 *
 * None of Buildora's assistants have any reason to emit source code — they
 * answer in plain sentences about buildings. So a code block coming back is a
 * reliable sign that something got through layers 1 and 2, and swapping it for
 * the refusal is safe: there is no legitimate answer it can be discarding.
 */
export function screenReply(reply: string): GuardVerdict {
  const looksLikeCode =
    /```/.test(reply) ||
    /^\s*(function|const|let|var|def|class|import|public static|#include|<\/?[a-z]+>)\s/m.test(
      reply
    );

  if (looksLikeCode) return { ok: false, category: "code-output", reply: OFF_TOPIC_REPLY };
  return { ok: true };
}

/**
 * The same output check, shaped for the inline helpers.
 *
 * Those aren't chatbots — the brief coach, bid check, diary digest and cost
 * estimator all build their own prompt from database rows and ask for one
 * paragraph of prose. The user's only way in is the free text they typed
 * earlier (a project description, a diary note), which arrives fenced as data.
 * Fencing is not a guarantee, so this is the backstop: if the paragraph comes
 * back with code in it, something got through and the paragraph is dropped.
 *
 * Every one of those helpers already treats a missing narrative as normal —
 * their checks and figures are computed in TypeScript and shown regardless — so
 * returning null here costs the user nothing.
 */
export function screenNarrative(text: string | null | undefined): string | null {
  if (!text) return null;
  if (!screenReply(text).ok) {
    console.warn("[ai-guard] dropped a narrative that came back looking like code");
    return null;
  }
  return text;
}

/* --------------------------------------------------------- repeat abuse ---- */

/**
 * Someone who trips the screen once is a curious user. Someone who trips it
 * five times in a row is working through a jailbreak list, and each attempt
 * still costs us a request to handle. After enough strikes the caller goes into
 * a short cool-off and stops reaching the assistant at all.
 *
 * In memory, like the rate limiter next door, and for the same reason: the API
 * is one process, and the worst a restart does is give someone a clean slate.
 */
const STRIKE_WINDOW_MS = 10 * 60_000;
const STRIKES_BEFORE_BLOCK = 5;
const BLOCK_MS = 15 * 60_000;

const strikes = new Map<string, { count: number; resetAt: number; blockedUntil: number }>();

/** Minutes left on a cool-off, or 0 when the caller is free to ask. */
export function blockedFor(key: string): number {
  const entry = strikes.get(key);
  if (!entry) return 0;
  const left = entry.blockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

/**
 * Records one refused attempt. Returns true when that attempt was the one that
 * started a cool-off, so the caller can log it.
 */
export function noteRefusal(key: string, category: string): boolean {
  const now = Date.now();

  // Sweep expired entries while we're here, so the map can't grow forever.
  for (const [k, v] of strikes) {
    if (v.resetAt <= now && v.blockedUntil <= now) strikes.delete(k);
  }

  const entry = strikes.get(key);
  if (!entry || entry.resetAt <= now) {
    strikes.set(key, { count: 1, resetAt: now + STRIKE_WINDOW_MS, blockedUntil: 0 });
    return false;
  }

  entry.count += 1;
  if (entry.count >= STRIKES_BEFORE_BLOCK && entry.blockedUntil <= now) {
    entry.blockedUntil = now + BLOCK_MS;
    console.warn(`[ai-guard] cooling off ${key} after ${entry.count} refusals (last: ${category})`);
    return true;
  }
  return false;
}
