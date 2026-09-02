import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherSource, dhakaDateKey } from "@buildora/shared";

/**
 * The rule under test: which Open-Meteo endpoint answers for a given date.
 *
 * Open-Meteo has two, and picking the wrong one fails in a way nobody notices.
 * The archive is ERA5 reanalysis and lags real time by about five days, so
 * asking it about last Tuesday returns *nothing* rather than an error — a
 * diary entry silently saved without its weather stamp. The forecast model
 * covers the recent past instead, but only about 92 days of it, beyond which
 * it is the archive or nothing.
 *
 * Every test loads the module fresh: weather.ts holds an in-process cache, and
 * a hit from a previous test would skip the fetch this one is asserting on.
 */

const DHAKA = { lat: 23.7806, lng: 90.4074 };

/** A date key `n` days before today, in the Dhaka calendar the service uses. */
function daysAgo(n: number): string {
  return dhakaDateKey(new Date(Date.now() - n * 86_400_000));
}

function openMeteoBody(date: string) {
  return {
    daily: {
      time: [date],
      weather_code: [61], // slight rain
      temperature_2m_max: [32.44],
      temperature_2m_min: [24.61],
      precipitation_sum: [12.5],
      wind_speed_10m_max: [18.2],
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Loads weather.ts with a clean cache and a stubbed fetch. */
async function loadWeather(body: unknown = null, ok = true, status = 200) {
  vi.resetModules();
  fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return import("./weather");
}

/** The URL the service actually called, parsed. */
function calledUrl(index = 0): URL {
  return new URL(String(fetchMock.mock.calls[index]?.[0]));
}

beforeEach(() => {
  fetchMock = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWeatherForDate — choosing an endpoint", () => {
  it("uses the forecast API for a recent date", async () => {
    const date = daysAgo(10);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    const snapshot = await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);

    // The archive would have no reading this recent — ERA5 lags by ~5 days.
    expect(calledUrl().hostname).toBe("api.open-meteo.com");
    expect(snapshot?.source).toBe(WeatherSource.FORECAST);
  });

  it("uses the archive API for a date beyond the forecast model's reach", async () => {
    const date = daysAgo(200);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    const snapshot = await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);

    expect(calledUrl().hostname).toBe("archive-api.open-meteo.com");
    expect(snapshot?.source).toBe(WeatherSource.ARCHIVE);
  });

  it("still uses the forecast API at exactly the 92-day limit", async () => {
    const date = daysAgo(92);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);
    expect(calledUrl().hostname).toBe("api.open-meteo.com");
  });

  it("switches to the archive one day past the limit", async () => {
    const date = daysAgo(93);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);
    expect(calledUrl().hostname).toBe("archive-api.open-meteo.com");
  });

  it("asks in Dhaka time, so a day means the same day the site worked", async () => {
    const date = daysAgo(3);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);

    const url = calledUrl();
    expect(url.searchParams.get("timezone")).toBe("Asia/Dhaka");
    expect(url.searchParams.get("start_date")).toBe(date);
    expect(url.searchParams.get("end_date")).toBe(date);
  });
});

describe("getWeatherForDate — the reading", () => {
  it("unpacks the parallel arrays, rounding each field the way it is read", async () => {
    const date = daysAgo(5);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    const snapshot = await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);

    expect(snapshot).toMatchObject({
      // Temperature and rainfall keep a decimal — a tenth of a degree and a
      // tenth of a millimetre both mean something on a site.
      tempMaxC: 32.4,
      tempMinC: 24.6,
      rainfallMm: 12.5,
      // Wind is rounded to whole km/h: nobody schedules a pour on 18.2 vs 18.
      windMaxKph: 18,
      weatherCode: 61,
    });
    expect(snapshot?.description).toBeTruthy();
  });

  it("skips a day with no temperature rather than recording it as zero", async () => {
    const date = daysAgo(5);
    // A gap in the model is not a cold, dry day.
    const { getWeatherForDate } = await loadWeather({
      daily: {
        time: [date],
        weather_code: [null],
        temperature_2m_max: [null],
        temperature_2m_min: [null],
        precipitation_sum: [null],
        wind_speed_10m_max: [null],
      },
    });

    expect(await getWeatherForDate(DHAKA.lat, DHAKA.lng, date)).toBeUndefined();
  });

  it("caches, so two projects on the same road cost one request", async () => {
    const date = daysAgo(20);
    const { getWeatherForDate } = await loadWeather(openMeteoBody(date));

    await getWeatherForDate(DHAKA.lat, DHAKA.lng, date);
    // Coordinates are rounded to ~1 km before they become a cache key, so a
    // plot a few metres away is the same lookup.
    await getWeatherForDate(DHAKA.lat + 0.0001, DHAKA.lng, date);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when Open-Meteo refuses, so the caller can decide", async () => {
    const date = daysAgo(5);
    const { getWeatherForDate } = await loadWeather(
      { error: true, reason: "Value cannot be after 2026-08-12" },
      false,
      400
    );

    // stampWeather catches this and saves the entry unstamped; the diary must
    // never be blocked by the weather service being down.
    await expect(getWeatherForDate(DHAKA.lat, DHAKA.lng, date)).rejects.toThrow();
  });
});
