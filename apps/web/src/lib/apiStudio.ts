import type {
  StudioDesign,
  StudioLoadResult,
  StudioVersion,
  StudioVersionSummary,
} from "@buildora/shared";
import { request } from "./api";
import { useSession } from "@/store/useSession";

/**
 * The BD Design Studio's client.
 *
 * Two things here are different from the other `api*` modules, and both are
 * because of how long a design session runs.
 *
 * **The token is read per call, not passed in.** Every other module takes a
 * `token` argument because its caller is a component that re-renders when the
 * session changes. The studio is not a component — it is an imperative engine
 * booted once inside an effect, and an architect can sit in it for an hour.
 * A token captured at boot would be long dead by the second autosave, so each
 * call reads the live one out of the session store. `request()` still handles
 * the refresh-and-retry when one expires mid-call.
 *
 * **Saving is fire-and-forget from the engine's point of view.** The engine
 * already owns the "Unsaved changes / All changes saved" chip and its 500 ms
 * debounce; these functions only move bytes.
 */

/** The live access token, or null when the session has gone. */
function token(): string | null {
  return useSession.getState().token;
}

function authed() {
  const t = token();
  if (!t) throw new Error("Your session has expired — sign in again to keep drawing.");
  return { Authorization: `Bearer ${t}` };
}

/** GET /api/projects/:id/studio — the saved design, the versions, and write access. */
export async function loadStudio(projectId: string): Promise<StudioLoadResult> {
  const res = await request<{ data: StudioLoadResult }>(`/api/projects/${projectId}/studio`, {
    headers: authed(),
  });
  return res.data;
}

/**
 * PUT /api/projects/:id/studio — the whole building, every time.
 *
 * `unloading` is for the save the studio fires as the tab goes away. That used
 * to be a `localStorage.setItem`, which is synchronous and always lands; a
 * `fetch` is not, and the browser cancels it along with the document. The
 * `keepalive` flag hands the request over for the browser to finish on its own,
 * which is exactly what it exists for — but the spec caps a keepalive body at
 * 64 KB, and a large design will exceed that. Over the cap the request goes out
 * normally and takes its chances, which is still better than being refused
 * outright.
 */
export async function saveStudio(
  projectId: string,
  design: StudioDesign,
  unloading = false
): Promise<void> {
  const body = JSON.stringify(design);
  await request(`/api/projects/${projectId}/studio`, {
    method: "PUT",
    headers: authed(),
    body,
    keepalive: unloading && body.length < 60_000,
  });
}

/** POST /api/projects/:id/studio/versions — returns the trimmed list back. */
export async function saveStudioVersion(
  projectId: string,
  version: StudioVersionSummary & { design: StudioDesign }
): Promise<StudioVersionSummary[]> {
  const res = await request<{ data: { versions: StudioVersionSummary[] } }>(
    `/api/projects/${projectId}/studio/versions`,
    { method: "POST", headers: authed(), body: JSON.stringify(version) }
  );
  return res.data.versions;
}

/** GET /api/projects/:id/studio/versions/:vid — fetched only when one is opened. */
export async function getStudioVersion(
  projectId: string,
  versionId: string
): Promise<StudioVersion> {
  const res = await request<{ data: StudioVersion }>(
    `/api/projects/${projectId}/studio/versions/${versionId}`,
    { headers: authed() }
  );
  return res.data;
}

/**
 * The studio's ✦ AI tab, answered through the floor-plan advisor that already
 * exists.
 *
 * The standalone tool posted to its own throwaway Node server with the Groq
 * key in a `.env` beside it. Buildora already has that proxy —
 * `POST /api/projects/:id/floor-plans/advice` — holding the key server-side,
 * rate-limited, and refusing anyone who can't see the project. Pointing the
 * studio at it means no second key, no second endpoint, and nothing about the
 * key reachable from the browser bundle.
 *
 * The studio's own system prompt rides along as the first line of `grounding`
 * so the answers keep the voice they have today: feet, Dhaka norms, short
 * dashed lists.
 */
export async function askStudioAdvisor(
  projectId: string,
  system: string,
  grounding: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await request<{ data: { reply: string } }>(
    `/api/projects/${projectId}/floor-plans/advice`,
    {
      method: "POST",
      headers: authed(),
      body: JSON.stringify({ grounding: `${system}\n\n${grounding}`, messages }),
    }
  );
  return res.data.reply;
}
