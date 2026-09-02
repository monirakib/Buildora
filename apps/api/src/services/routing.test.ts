import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The trap this file exists for: OpenRouteService takes coordinates
 * **longitude first**, the opposite of every other map API in this codebase.
 * Getting the order wrong does not error — ORS happily routes to wherever
 * (lat, lng) lands, which for Dhaka is a point in the Indian Ocean — so the
 * failure shows up as a plausible-looking delivery ETA that is simply wrong.
 *
 * `routeBetween` reads its key once at module load, so each test loads the
 * module fresh with the environment it needs.
 */

const DHAKA = { lat: 23.7806, lng: 90.4074 }; // Gulshan
const SAVAR = { lat: 23.8583, lng: 90.2667 }; // a supplier's warehouse

/** Loads routing.ts with ORS configured (or not), isolated from other tests. */
async function loadRouting(apiKey: string | undefined) {
  vi.resetModules();
  if (apiKey) process.env.ORS_API_KEY = apiKey;
  else delete process.env.ORS_API_KEY;
  return import("./routing");
}

function orsResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** A minimal well-formed ORS GeoJSON answer: 12.34 km, 25 minutes, 2 points. */
const OK_BODY = {
  features: [
    {
      properties: { summary: { distance: 12_340, duration: 1500 } },
      // GeoJSON is lng,lat — the same order ORS expects on the way in.
      geometry: {
        coordinates: [
          [90.4074, 23.7806],
          [90.2667, 23.8583],
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ORS_API_KEY;
});

describe("routeBetween — the coordinate order", () => {
  it("sends longitude first, not latitude", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => orsResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const { routeBetween } = await loadRouting("test-key");
    await routeBetween(DHAKA, SAVAR);

    const init = fetchMock.mock.calls[0]?.[1];
    const sent = JSON.parse(String(init?.body)) as { coordinates: [number, number][] };

    // Longitudes near 90, latitudes near 23. If these ever swap, the numbers
    // still look like coordinates — which is exactly why this is asserted.
    expect(sent.coordinates).toEqual([
      [DHAKA.lng, DHAKA.lat],
      [SAVAR.lng, SAVAR.lat],
    ]);
    expect(sent.coordinates[0]?.[0]).toBeGreaterThan(89);
    expect(sent.coordinates[0]?.[1]).toBeLessThan(30);
  });

  it("flips the returned polyline back to lat/lng for Leaflet", async () => {
    vi.stubGlobal("fetch", async () => orsResponse(OK_BODY));

    const { routeBetween } = await loadRouting("test-key");
    const result = await routeBetween(DHAKA, SAVAR);

    // Leaflet wants { lat, lng }; ORS gave [lng, lat].
    expect(result?.polyline?.[0]).toEqual({ lat: 23.7806, lng: 90.4074 });
    expect(result?.polyline).toHaveLength(2);
  });
});

describe("routeBetween — the numbers", () => {
  it("converts metres to one decimal of a kilometre and seconds to minutes", async () => {
    vi.stubGlobal("fetch", async () => orsResponse(OK_BODY));

    const { routeBetween } = await loadRouting("test-key");
    const result = await routeBetween(DHAKA, SAVAR);

    expect(result?.distanceKm).toBe(12.3);
    expect(result?.durationMin).toBe(25);
  });

  it("authenticates with the raw key, which is what ORS expects", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => orsResponse(OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const { routeBetween } = await loadRouting("test-key");
    await routeBetween(DHAKA, SAVAR);

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    // Not "Bearer test-key" — ORS takes the key on its own.
    expect(headers.Authorization).toBe("test-key");
  });
});

describe("routeBetween — degrading instead of failing", () => {
  it("is disabled, and calls nothing, without a key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { routeBetween, isRoutingConfigured } = await loadRouting(undefined);

    expect(isRoutingConfigured()).toBe(false);
    expect(await routeBetween(DHAKA, SAVAR)).toBeUndefined();
    // The point of the guard: no wasted request, no thrown error.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns undefined on an ORS error rather than throwing", async () => {
    vi.stubGlobal("fetch", async () => orsResponse({ error: "quota" }, false, 429));

    const { routeBetween } = await loadRouting("test-key");
    // A missing ETA must never be able to block placing an order.
    expect(await routeBetween(DHAKA, SAVAR)).toBeUndefined();
  });

  it("returns undefined when ORS answers with no route", async () => {
    vi.stubGlobal("fetch", async () => orsResponse({ features: [] }));

    const { routeBetween } = await loadRouting("test-key");
    expect(await routeBetween(DHAKA, SAVAR)).toBeUndefined();
  });

  it("returns undefined when the request throws — a timeout, or no network", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("The operation was aborted due to timeout");
    });

    const { routeBetween } = await loadRouting("test-key");
    expect(await routeBetween(DHAKA, SAVAR)).toBeUndefined();
  });
});
