import type { HydratedDocument } from "mongoose";
import { DapZone, type DapZoneDoc } from "../models/DapZone";

/**
 * Finding the DAP zone that governs a locality.
 *
 * This lived inside the permits controller until the assistant needed the same
 * answer. It matches differently from the zone *search*: there the user types
 * part of a name and we widen ("Dhanm" → "Dhanmondi"). Here the name arrives
 * from a map or a brief, longer and more specific than the zone table
 * ("Gulshan 2", "Dhanmondi Residential Area"), so the zone name has to be found
 * *inside* the locality. The match therefore runs both ways, most specific
 * first.
 */

/** Whole-word containment, so "Gulshan" matches "Gulshan 2" but not "Gulshanpur". */
function containsWord(haystack: string, needle: string): boolean {
  const safe = needle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!safe) return false;
  return new RegExp(`\\b${safe}\\b`, "i").test(haystack);
}

/**
 * The one zone governing an area name, or null when the table has no record of
 * it. Callers must say "no record" rather than guess — an invented FAR limit is
 * worse than no answer.
 */
export async function findZoneForArea(area: string): Promise<HydratedDocument<DapZoneDoc> | null> {
  const needle = area.trim();
  if (needle.length < 2) return null;

  // The zone table is admin-maintained and small, so ranking the candidates in
  // code here is clearer than expressing two-way containment as a Mongo query.
  const zones = await DapZone.find().limit(200);

  const ranked = zones
    .map((zone) => {
      const name = zone.areaName;
      let rank = 0;
      if (name.toLowerCase() === needle.toLowerCase()) rank = 3;
      else if (containsWord(needle, name))
        rank = 2; // "Gulshan 2" is in zone "Gulshan"
      else if (containsWord(name, needle)) rank = 1; // "Gulshan" typed, zone "Gulshan Model Town"
      return { zone, rank };
    })
    .filter((c) => c.rank > 0)
    // Best rank first; ties go to the longer zone name, as the more specific one.
    .sort((a, b) => b.rank - a.rank || b.zone.areaName.length - a.zone.areaName.length);

  return ranked[0]?.zone ?? null;
}
