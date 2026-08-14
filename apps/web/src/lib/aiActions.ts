"use client";

import type { AiActionKey, AiSuggestedAction } from "@buildora/shared";
import { postBrief } from "./apiProjects";

/**
 * What each suggested action actually does.
 *
 * This table is the reason the assistant can offer buttons safely. The server
 * sends an action *key* and at most one id — never a URL, a method, a body or a
 * label. The browser looks the key up here to decide what happens, so the set
 * of things a button can possibly do is fixed at build time by this file, not
 * by anything a model wrote.
 *
 * A key that isn't in this table renders nothing at all. That is deliberate:
 * adding a new action means editing this file, which means someone read it.
 *
 * Actions that change data are `kind: "call"` and always confirm first. There
 * is exactly one of those today — posting a brief the user already owns — and
 * every new one should be weighed on its own, not waved through because the
 * mechanism exists.
 */

export interface AiActionParams {
  projectId?: string;
  tenderId?: string;
}

export type AiActionHandler =
  | { kind: "navigate"; href: (params: AiActionParams) => string }
  | {
      kind: "call";
      confirm: string;
      /** Where to land afterwards, so the user sees what changed. */
      thenHref: (params: AiActionParams) => string;
      run: (token: string, params: AiActionParams) => Promise<void>;
    };

export const AI_ACTIONS: Record<AiActionKey, AiActionHandler> = {
  OPEN_BRIEF_FORM: { kind: "navigate", href: () => "/projects/new" },
  OPEN_PERMITS: { kind: "navigate", href: () => "/permits" },
  OPEN_BRIEFS: { kind: "navigate", href: () => "/briefs" },
  OPEN_TENDERS: { kind: "navigate", href: () => "/tenders" },
  OPEN_PROJECT: { kind: "navigate", href: (p) => `/projects/${p.projectId ?? ""}` },
  OPEN_DIARY: { kind: "navigate", href: (p) => `/projects/${p.projectId ?? ""}?tab=diary` },
  POST_BRIEF: {
    kind: "call",
    confirm: "Post this brief so verified architects can send you proposals?",
    thenHref: (p) => `/projects/${p.projectId ?? ""}`,
    // The ordinary endpoint, with the ordinary permission check. Nothing about
    // the request being suggested by the assistant makes it privileged.
    run: async (token, p) => {
      if (!p.projectId) throw new Error("No project to post");
      await postBrief(token, p.projectId);
    },
  },
};

/** Drops anything the browser doesn't recognise, rather than guessing. */
export function knownActions(actions: AiSuggestedAction[]): AiSuggestedAction[] {
  return actions.filter((a) => a.action in AI_ACTIONS);
}
