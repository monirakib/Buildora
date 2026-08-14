import type { AiSuggestedAction } from "@buildora/shared";
import type { AuthPayload } from "../middleware/auth";
import { askAi, type AiMessage, type AiToolSpec } from "./ai";

/**
 * Letting the assistant look things up before it answers.
 *
 * The model can't see the database. What it can do is say "I need
 * get_project_status for 66f1…", which is a *tool call*. This loop runs the
 * lookup, hands the result back, and asks again — so an answer about real
 * numbers is built from real rows instead of guessed.
 *
 * Two numbers bound the whole thing, and they are the only two:
 */

/** Model calls per user turn. Three is enough for "look up A, then look up B". */
const MAX_ROUNDS = 3;

/** Lookups per round, so one greedy reply can't fire off twenty queries. */
const MAX_CALLS_PER_ROUND = 4;

export interface AiTool {
  spec: AiToolSpec;
  /** Roles this tool is offered to. Undefined means everyone. */
  roles?: string[];
  /**
   * Runs the lookup. `actions` is the collecting array a tool can push a
   * suggested button onto; most tools ignore it.
   */
  run(args: unknown, auth: AuthPayload, actions: AiSuggestedAction[]): Promise<string>;
}

export interface AiConversationResult {
  reply: string;
  actions: AiSuggestedAction[];
  /** Which lookups actually ran, so the UI (and a demo) can show the work. */
  usedTools: string[];
}

/**
 * One user turn: ask, run any lookups the model wants, ask again, answer.
 *
 * Why this can't spin forever: on the final round the tools are simply not
 * sent. A model with no tools available cannot return a tool call, so the
 * `toolCalls.length === 0` branch has to fire. The bound isn't a guard we hope
 * holds, it's the shape of the last request.
 */
export async function runAiConversation(opts: {
  messages: AiMessage[];
  tools: AiTool[];
  auth: AuthPayload;
  maxTokens?: number;
}): Promise<AiConversationResult> {
  const { tools, auth } = opts;
  const messages = [...opts.messages];
  const actions: AiSuggestedAction[] = [];
  const usedTools: string[] = [];

  // Same question twice in one turn gets the same answer without a second trip
  // to Mongo. Keyed on name + arguments, and thrown away when the turn ends.
  const seen = new Map<string, string>();

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const isLastRound = round === MAX_ROUNDS;

    const reply = await askAi({
      messages,
      // Withholding tools on the last round is what terminates the loop.
      tools: isLastRound ? undefined : tools.map((t) => t.spec),
      maxTokens: opts.maxTokens,
    });

    if (reply.toolCalls.length === 0) {
      return { reply: reply.text, actions, usedTools };
    }

    // The model's own message has to go back with its tool_calls attached —
    // the API rejects a tool result that doesn't answer a call it can see.
    messages.push({
      role: "assistant",
      content: reply.text,
      tool_calls: reply.toolCalls,
    });

    for (const call of reply.toolCalls.slice(0, MAX_CALLS_PER_ROUND)) {
      const name = call.function.name;
      const key = `${name}:${call.function.arguments}`;
      let result = seen.get(key);

      if (result === undefined) {
        const tool = tools.find((t) => t.spec.name === name);
        if (!tool) {
          result = `There is no lookup called ${name}.`;
        } else {
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            result = await tool.run(args, auth, actions);
          } catch (err) {
            // A failed lookup must never take the whole chat down with it. The
            // model reads this and apologises in prose, which is a much better
            // outcome for the user than a 502.
            console.error(`[ai] tool ${name} failed:`, err instanceof Error ? err.message : err);
            result = "That lookup failed. Tell the user you couldn't check it just now.";
          }
        }
        seen.set(key, result);
        usedTools.push(name);
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: result,
      });
    }
  }

  // Unreachable: the last round runs without tools, so it always returns above.
  // Kept so the function has a return on every path rather than relying on the
  // compiler agreeing with that argument.
  return { reply: "I couldn't work that out just now.", actions, usedTools };
}
