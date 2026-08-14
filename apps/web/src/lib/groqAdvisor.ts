import {
  FURNITURE_PRESETS,
  ROOM_KIND_LABELS,
  floorLabel,
  polygonAreaSqft,
  rectFromPoints,
  type PlanCompliance,
  type PlanFurniture,
  type PlanRoom,
} from "@buildora/shared";
import { request } from "./api";

/**
 * The floor-plan layout advisor, answered by Groq's hosted Llama 3.3 through
 * our own API.
 *
 * The model is only ever asked for *advice* — room proportions, circulation,
 * ventilation. Every number it is shown (room sizes, plot area, the FAR and
 * coverage limits) is measured or read from the database first and handed to
 * it as settled fact, the same split the cost estimator uses on the API side.
 * A language model asked to compute a FAR will produce something plausible;
 * an architect deserves the real figure.
 *
 * This file's job is only to describe the drawing. The request goes to
 * `POST /api/projects/:id/floor-plans/advice`, which holds the Groq key
 * server-side in `apps/api/.env` — a key compiled into the browser bundle is a
 * key anyone can read out of devtools and spend.
 *
 * The description is built here, in the browser, and not on the server: the
 * point of the advisor is the plan *as it is being drawn*, which has not been
 * saved yet and so does not exist in the database to read.
 */

export interface AdviceMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The block of real state handed to the model with each question: what is
 * actually drawn on the floor being edited, and what the zone allows.
 */
export function describeFloor({
  level,
  rooms,
  furniture,
  compliance,
  areaName,
}: {
  level: number;
  rooms: PlanRoom[];
  furniture: PlanFurniture[];
  compliance: PlanCompliance | null;
  areaName: string;
}): string {
  const lines: string[] = [`Floor being edited: ${floorLabel(level)}. Location: ${areaName}.`];

  if (rooms.length === 0) {
    lines.push("No rooms drawn on this floor yet.");
  } else {
    lines.push(`Rooms on this floor (${rooms.length}):`);
    for (const room of rooms) {
      // A rectangle can be quoted as "12x10 ft", which is how sizes are
      // discussed; anything else only has an area worth quoting.
      const rect = rectFromPoints(room.points);
      const type = room.kind ? ROOM_KIND_LABELS[room.kind] : "unspecified type";
      const size = rect
        ? `${round(rect.widthFt)}x${round(rect.heightFt)} ft`
        : `${Math.round(polygonAreaSqft(room.points))} sq ft, irregular shape`;
      lines.push(`- ${room.name} (${type}): ${size}`);
    }
  }

  if (furniture.length > 0) {
    // Counts, not positions — the model advises on the layout, and a list of
    // twenty coordinates would crowd out everything that matters.
    const counts = new Map<string, number>();
    for (const item of furniture) {
      const label = FURNITURE_PRESETS[item.kind].label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const summary = [...counts].map(([label, n]) => (n > 1 ? `${n}x ${label}` : label)).join(", ");
    lines.push(`Furniture placed: ${summary}.`);
  }

  if (compliance) {
    lines.push(
      `Plot: ${compliance.plotAreaSqft} sq ft. Built area across all drawn floors: ${compliance.totalBuiltAreaSqft} sq ft. Current FAR: ${compliance.far}. Ground coverage: ${compliance.groundCoveragePct}%.`
    );
    if (compliance.zoneCode) {
      lines.push(
        `DAP zone ${compliance.zoneCode} allows FAR up to ${compliance.maxFar} and ground coverage up to ${compliance.maxGroundCoveragePct}%${compliance.maxFloors ? `, over at most ${compliance.maxFloors} floors` : ""}.`
      );
    } else {
      lines.push("Buildora has no DAP zone record for this area, so there are no limits to quote.");
    }
    if (compliance.issues.length > 0) {
      lines.push(`Compliance warnings already raised: ${compliance.issues.join(" ")}`);
    }
  }

  return lines.join("\n");
}

/** Trim a measurement to at most two decimals without trailing zeroes. */
function round(feet: number): number {
  return Math.round(feet * 100) / 100;
}

/**
 * Ask the advisor. `history` is the conversation so far and `grounding` is the
 * live plan description, re-sent with every turn so advice always reflects the
 * drawing as it stands rather than as it was when the chat began.
 */
export async function askLayoutAdvisor(
  token: string,
  projectId: string,
  history: AdviceMessage[],
  grounding: string
): Promise<string> {
  const res = await request<{ data: { reply: string } }>(
    `/api/projects/${projectId}/floor-plans/advice`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ grounding, messages: history }),
    }
  );
  return res.data.reply;
}
