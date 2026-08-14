import { env } from "../config/env";

/**
 * One way to talk to a language model.
 *
 * The platform has two providers and both are free tiers, which is the whole
 * reason this file exists. Groq hosts Llama and is fast; Gemini is Google's.
 * Either one can start refusing requests halfway through a demo because the
 * day's quota ran out, and neither is worth paying for. So: Groq answers first,
 * and if it rate limits or falls over, the same question goes to Gemini
 * instead. Two free tiers behave like one reliable one.
 *
 * The message vocabulary here is OpenAI's ("system" / "user" / "assistant" /
 * "tool"), because Groq speaks it natively and because tool calling only exists
 * in that shape. Gemini's format is different and is converted in one place,
 * toGeminiBody, rather than leaking into every caller.
 *
 * Keys are read here and never leave the server.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Long enough for a slow answer, short enough not to hang a request. */
const TIMEOUT_MS = 25000;

export type AiRole = "system" | "user" | "assistant" | "tool";

/** A model's request to run one of our functions. `arguments` is a JSON string. */
export interface AiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AiMessage {
  role: AiRole;
  content: string;
  /** Present only on an assistant message that asked for tools. */
  tool_calls?: AiToolCall[];
  /** Present only on a "tool" message, naming the call it answers. */
  tool_call_id?: string;
  /** The tool's name, on a "tool" message. */
  name?: string;
}

/** A function the model is allowed to call, in JSON Schema. */
export interface AiToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiReply {
  text: string;
  toolCalls: AiToolCall[];
  provider: "groq" | "gemini";
}

/**
 * Errors carry whether it's worth trying the other provider. A 429 or a network
 * blip is worth retrying elsewhere; a malformed request or a bad key is a bug in
 * our code, and quietly spending the other provider's quota on it would hide
 * that instead of surfacing it.
 */
class AiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** True when at least one provider is usable, so callers can 503 with a reason. */
export function isAiConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY || env.GEMINI_API_KEY);
}

/**
 * A rough tally of how many model calls this process has made, logged so we can
 * answer "how much of the free tier does a demo cost?" with a number instead of
 * a shrug. Deliberately in memory: a restart resetting it costs nothing.
 */
const callCount = { groq: 0, gemini: 0 };

export function aiCallCount() {
  return { ...callCount };
}

/* ---------------------------------------------------------------- Groq ---- */

async function askGroqProvider(opts: {
  messages: AiMessage[];
  tools?: AiToolSpec[];
  maxTokens: number;
  temperature: number;
}): Promise<AiReply> {
  callCount.groq += 1;

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: opts.messages,
        // Only send the tools key when there are tools; some models behave
        // differently when handed an empty array.
        ...(opts.tools?.length
          ? {
              tools: opts.tools.map((t) => ({ type: "function", function: t })),
              tool_choice: "auto",
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Network failure or timeout — the other provider might be fine.
    throw new AiError("Couldn't reach the assistant, try again in a moment", true);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] groq ${res.status}: ${detail.slice(0, 300)}`);
    // 429 and 5xx are worth retrying elsewhere. 400/401/403 are our bug.
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiError(
      res.status === 429
        ? "The assistant is busy, try again in a minute"
        : "The assistant couldn't answer just now",
      retryable
    );
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: AiToolCall[] } }[];
  };
  const message = body.choices?.[0]?.message;
  const text = message?.content?.trim() ?? "";
  const toolCalls = message?.tool_calls ?? [];

  // No text and no tool calls means nothing usable came back.
  if (!text && toolCalls.length === 0) {
    throw new AiError("The assistant couldn't answer just now", true);
  }

  return { text, toolCalls, provider: "groq" };
}

/* -------------------------------------------------------------- Gemini ---- */

/**
 * Converts our OpenAI-shaped messages into Gemini's request body.
 *
 * Three differences to bridge: Gemini takes the system prompt out of the message
 * list and into its own field, it calls the assistant "model", and it has no
 * role for tool results at all — so a tool result is folded into a user turn,
 * clearly labelled, which is enough for the model to read it.
 */
function toGeminiBody(messages: AiMessage[], maxTokens: number, temperature: number) {
  const systemParts: string[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ text: `Tool result (${m.name ?? "lookup"}): ${m.content}` }],
      });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  return {
    ...(systemParts.length
      ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } }
      : {}),
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
}

async function askGeminiProvider(opts: {
  messages: AiMessage[];
  maxTokens: number;
  temperature: number;
}): Promise<AiReply> {
  callCount.gemini += 1;

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}/${env.GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY!,
      },
      body: JSON.stringify(toGeminiBody(opts.messages, opts.maxTokens, opts.temperature)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiError("Couldn't reach the assistant, try again in a moment", true);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai] gemini ${res.status}: ${detail.slice(0, 300)}`);
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiError(
      res.status === 429
        ? "The assistant is busy, try again in a minute"
        : "The assistant couldn't answer just now",
      retryable
    );
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new AiError("The assistant couldn't answer just now", true);

  // Gemini's function calling uses a different wire format from OpenAI's, and
  // this path only runs when Groq is already down. Rather than maintain a second
  // translation for a fallback of a fallback, tools are dropped before we get
  // here (see askAi) and no tool calls are ever returned.
  return { text, toolCalls: [], provider: "gemini" };
}

/* ----------------------------------------------------------------- API ---- */

/**
 * Ask a model. Tries Groq, falls back to Gemini when Groq fails in a way that
 * the other provider might survive.
 *
 * When the fallback runs and tools were requested, the tools are dropped — see
 * askGeminiProvider for why — and the model is told plainly that it can't look
 * things up. An honest "I can't check that right now" beats a confident guess,
 * which is exactly what we'd get if we let it answer a data question with no
 * data.
 */
export async function askAi(opts: {
  messages: AiMessage[];
  tools?: AiToolSpec[];
  maxTokens?: number;
  temperature?: number;
}): Promise<AiReply> {
  const maxTokens = opts.maxTokens ?? 700;
  const temperature = opts.temperature ?? 0.4;

  if (!isAiConfigured()) {
    throw new AiError("The assistant isn't configured (no model API key set)", false);
  }

  if (env.GROQ_API_KEY) {
    try {
      return await askGroqProvider({
        messages: opts.messages,
        tools: opts.tools,
        maxTokens,
        temperature,
      });
    } catch (err) {
      const retryable = err instanceof AiError ? err.retryable : true;
      // Nothing to fall back to, or the failure was our fault — let it through.
      if (!retryable || !env.GEMINI_API_KEY) throw err;
      console.warn("[ai] groq failed, falling back to gemini");
    }
  }

  if (!env.GEMINI_API_KEY) {
    throw new AiError("The assistant isn't configured (no model API key set)", false);
  }

  const messages = opts.tools?.length
    ? [
        ...opts.messages,
        {
          role: "system" as const,
          content:
            "Tool lookups are unavailable right now. Answer only from the conversation and the context above. If the question needs a database lookup you cannot do, say so plainly instead of guessing.",
        },
      ]
    : opts.messages;

  return askGeminiProvider({ messages, maxTokens, temperature });
}
