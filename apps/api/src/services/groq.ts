import { env } from "../config/env";

/**
 * Groq, the second model provider on the platform, behind the floor plan's
 * layout advisor. Gemini answers the Buildora Guide and reads NIDs; Groq hosts
 * Llama, which is fast and generous enough on the free tier to sit beside an
 * architect while they draw.
 *
 * The key is read here and never leaves the server. Calling Groq straight from
 * the browser would have worked too, but a key in client JavaScript is a key
 * anyone can read out of devtools and spend.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Long enough for a slow answer, short enough not to hang a request. */
const TIMEOUT_MS = 25000;

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** True when a key is configured, so callers can 503 with a clear reason. */
export function isGroqConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
}

/**
 * One round trip to Groq's chat completions endpoint, which speaks the OpenAI
 * wire format. Throws with a message meant for the user, never the raw error.
 */
export async function askGroq(messages: GroqMessage[], maxTokens = 700): Promise<string> {
  if (!env.GROQ_API_KEY) throw new Error("The layout advisor isn't configured");

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
        max_tokens: maxTokens,
        temperature: 0.4,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("Couldn't reach the layout advisor, try again in a moment");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[groq] ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(
      res.status === 429
        ? "The advisor is rate limited right now, try again in a minute"
        : "The advisor couldn't answer just now"
    );
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = body.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("The advisor couldn't answer just now");
  return reply;
}
