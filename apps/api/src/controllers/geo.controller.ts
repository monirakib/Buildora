import type { Request, Response } from "express";
import { z } from "zod";
import type { GeoAddress, GeoPlace } from "@buildora/shared";
import { env } from "../config/env";

/**
 * Address lookups for the plot map picker, proxied to OpenStreetMap's
 * Nominatim geocoder.
 *
 * We proxy instead of calling Nominatim from the browser because its usage
 * policy asks for three things a browser can't promise: a User-Agent that
 * identifies the app, no more than one request a second across all users, and
 * caching of repeated lookups. All three are handled below.
 */

/** Nominatim's rule: at most one request per second, from everyone together. */
const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 60 * 60 * 1000; // an hour — addresses don't move
const CACHE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 8000;

// Requests are chained one after another so two users searching at the same
// time still leave a gap between the calls that actually reach Nominatim.
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `fn` after every earlier call, and at least MIN_GAP_MS after the last. */
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  // The chain must survive a failed call, so swallow the error on this copy —
  // the caller still gets the real rejection through `run`.
  chain = run.catch(() => undefined);
  return run;
}

const cache = new Map<string, { at: number; value: unknown }>();

function readCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function writeCache(key: string, value: unknown) {
  // Oldest entry goes first once the cache is full (Map keeps insertion order).
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/** The address fields Nominatim fills in, all of them optional. */
interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  residential?: string;
  city_district?: string;
  town?: string;
  village?: string;
  city?: string;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
  error?: string;
}

/**
 * Picks the locality name out of a Nominatim address.
 *
 * The order matters: for Dhaka, `suburb` is the field that actually holds the
 * names the DAP zone table is keyed by — Gulshan, Uttara, Mirpur, Dhanmondi.
 * `quarter` and `neighbourhood` sit below it because they come back far too
 * fine-grained to match a zone ("Sector 13", "Block F", "Gulshan 2").
 */
function pickAreaName(address?: NominatimAddress): string | undefined {
  if (!address) return undefined;
  const name =
    address.suburb ??
    address.city_district ??
    address.residential ??
    address.neighbourhood ??
    address.quarter ??
    address.town ??
    address.village ??
    address.city;
  if (!name) return undefined;
  // OSM writes "Bashundhara Residential Area" where the zone table just says
  // "Bashundhara", and the checker matches on the stored name — so trim the
  // decoration off the end.
  return name.replace(/\s+(Residential Area|R\/A|Housing Society)$/i, "").trim();
}

/** One GET to Nominatim, throttled, with the identifying headers it asks for. */
async function callNominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ format: "jsonv2", ...params });
  const url = `${env.NOMINATIM_BASE_URL}${path}?${query.toString()}`;

  const res = await queued(() =>
    fetch(url, {
      headers: {
        "User-Agent": `Buildora/0.1 (${env.NOMINATIM_CONTACT})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  );

  if (!res.ok) {
    console.error(`[geo] Nominatim ${res.status} for ${path}`);
    // 403 almost always means the User-Agent looked like a bot. Nominatim
    // blocks placeholder contacts outright — "example.com" in NOMINATIM_CONTACT
    // is rejected — so name the setting rather than shrug at the developer.
    if (res.status === 403) {
      throw new Error("The map service refused the request, check NOMINATIM_CONTACT in .env");
    }
    throw new Error(
      res.status === 429
        ? "The map search is busy, try again in a moment"
        : "Couldn't reach the map service"
    );
  }
  return (await res.json()) as T;
}

const searchSchema = z.object({
  q: z.string().trim().min(3, "Type at least 3 characters to search").max(120),
});

/**
 * GET /api/geo/search?q=… — place suggestions for the picker's search box.
 * Limited to Bangladesh, since every plot on Buildora is here.
 */
export async function searchPlaces(req: Request, res: Response) {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid search" } });
  }
  const q = parsed.data.q;

  const key = `search:${q.toLowerCase()}`;
  const cached = readCache<GeoPlace[]>(key);
  if (cached) return res.json({ data: { places: cached } });

  let results: NominatimPlace[];
  try {
    results = await callNominatim<NominatimPlace[]>("/search", {
      q,
      countrycodes: "bd",
      addressdetails: "1",
      limit: "6",
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "Map search failed" } });
  }

  const places: GeoPlace[] = results.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    areaName: pickAreaName(r.address),
  }));

  writeCache(key, places);
  return res.json({ data: { places } });
}

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * GET /api/geo/reverse?lat=&lng= — the address at a dropped pin, so the brief
 * form can fill in the plot address and the area that drives the DAP zone check.
 */
export async function reverseGeocode(req: Request, res: Response) {
  const parsed = reverseSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Pick a point on the map first" } });
  }
  const { lat, lng } = parsed.data;

  // Rounding to ~11 m makes tiny marker nudges reuse the cached answer.
  const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = readCache<GeoAddress>(key);
  if (cached) return res.json({ data: { address: cached } });

  let result: NominatimPlace;
  try {
    result = await callNominatim<NominatimPlace>("/reverse", {
      lat: String(lat),
      lon: String(lng),
      addressdetails: "1",
      zoom: "18", // building-level detail
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: { message: err instanceof Error ? err.message : "Address lookup failed" } });
  }

  // Nominatim answers with `{ error: "Unable to geocode" }` out at sea.
  if (result.error || !result.display_name) {
    return res.status(404).json({ error: { message: "No address found at that point" } });
  }

  const address: GeoAddress = {
    formattedAddress: result.display_name,
    areaName: pickAreaName(result.address),
  };

  writeCache(key, address);
  return res.json({ data: { address } });
}
