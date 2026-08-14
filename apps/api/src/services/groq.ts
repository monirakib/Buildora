import { askAi, isAiConfigured, type AiMessage } from "./ai";

/**
 * The floor plan's layout advisor.
 *
 * This used to talk to Groq directly. It now goes through services/ai.ts like
 * everything else, which means the advisor gained a Gemini fallback for free —
 * before, a Groq rate limit mid-session simply ended the conversation.
 *
 * The shape is kept as it was so the advisor's controller didn't have to
 * change: the same two exports, the same message type, the same behaviour of
 * throwing a message meant for the user rather than a raw error.
 */

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** True when a model is reachable, so callers can 503 with a clear reason. */
export function isGroqConfigured(): boolean {
  return isAiConfigured();
}

/**
 * One question to whichever provider is answering. Throws with a message meant
 * for the user, never the raw error.
 */
export async function askGroq(messages: GroqMessage[], maxTokens = 700): Promise<string> {
  const answer = await askAi({ messages: messages as AiMessage[], maxTokens });
  if (!answer.text) throw new Error("The advisor couldn't answer just now");
  return answer.text;
}
