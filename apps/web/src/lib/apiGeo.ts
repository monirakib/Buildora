import type { GeoAddress, GeoPlace } from "@buildora/shared";
import { request } from "./api";

/**
 * The map picker's address lookups. Both go through our own API rather than
 * straight to OpenStreetMap — see apps/api/src/controllers/geo.controller.ts
 * for why (User-Agent, rate limit, caching).
 */

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** GET /api/geo/search — place suggestions for the search box. */
export async function searchPlaces(
  token: string,
  q: string,
  signal?: AbortSignal
): Promise<GeoPlace[]> {
  const res = await request<{ data: { places: GeoPlace[] } }>(
    `/api/geo/search?q=${encodeURIComponent(q)}`,
    { headers: authed(token), signal }
  );
  return res.data.places;
}

/** GET /api/geo/reverse — the address at a dropped pin. */
export async function reverseGeocode(
  token: string,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<GeoAddress> {
  const res = await request<{ data: { address: GeoAddress } }>(
    `/api/geo/reverse?lat=${lat}&lng=${lng}`,
    { headers: authed(token), signal }
  );
  return res.data.address;
}
