import { env } from "../config/env";
import type { LatLng, RouteResult } from "@buildora/shared";

/**
 * Driving distance and time between two points, via OpenRouteService.
 *
 * Straight-line distance is the wrong number for a delivery: a supplier across
 * a river in Keraniganj is 3 km away and an hour's drive. ORS answers with the
 * road route, which is what a buyer actually waits for, and returns the geometry
 * so the existing Leaflet map can draw it.
 *
 * Free tier, and keyless requests aren't allowed — without ORS_API_KEY every
 * call returns undefined and the marketplace simply doesn't show an ETA, the
 * same degradation rule the other optional integrations follow.
 */

const ORS_ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const REQUEST_TIMEOUT_MS = 12000;

const configured = Boolean(env.ORS_API_KEY);

if (!configured) {
  console.warn("[routing] ORS_API_KEY not set, delivery distance and ETA are disabled");
}

export function isRoutingConfigured(): boolean {
  return configured;
}

/**
 * Routes from `from` to `to`. Returns undefined rather than throwing — a
 * missing ETA must never break an order.
 */
export async function routeBetween(from: LatLng, to: LatLng): Promise<RouteResult | undefined> {
  if (!configured) return undefined;

  try {
    const res = await fetch(ORS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: env.ORS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      // ORS takes coordinates longitude-first, which is the opposite of every
      // other map API in this codebase. Getting it backwards silently routes
      // somewhere in the ocean rather than erroring, so it's worth the comment.
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(
        `[routing] ORS ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`
      );
      return undefined;
    }

    const body = (await res.json()) as {
      features?: {
        properties?: { summary?: { distance?: number; duration?: number } };
        geometry?: { coordinates?: [number, number][] };
      }[];
    };

    const feature = body.features?.[0];
    const summary = feature?.properties?.summary;
    if (!summary?.distance) return undefined;

    return {
      distanceKm: Math.round((summary.distance / 1000) * 10) / 10,
      durationMin: Math.round((summary.duration ?? 0) / 60),
      // Flipped back to lat/lng so Leaflet can use the polyline directly.
      polyline: (feature?.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
      routedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[routing] failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}
