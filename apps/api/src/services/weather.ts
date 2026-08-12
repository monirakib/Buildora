import {
  WeatherSource,
  dhakaDateKey,
  weatherAdvisory,
  weatherDescription,
  type WeatherForecastDay,
  type WeatherSnapshot,
} from "@buildora/shared";
import { env } from "../config/env";

/**
 * Open-Meteo — the daily weather over a project's plot.
 *
 * Chosen over the alternatives because it needs no API key and no signup at
 * all: there is nothing for a teammate to configure before the site diary
 * works on their machine. Free for non-commercial use, which a course project
 * is.
 *
 * Two endpoints, picked automatically by how far back the date is:
 *
 * - the **forecast** API answers for roughly the last 92 days through 16 days
 *   ahead, from the live model;
 * - the **archive** API answers for older dates from ERA5 reanalysis, which
 *   lags real time by about five days — which is exactly why the recent past
 *   has to come from the forecast endpoint instead.
 *
 * Both take `start_date`/`end_date` and return parallel arrays under `daily`,
 * so one parser handles them.
 */

/** How far back the forecast endpoint will still answer. */
const FORECAST_PAST_DAYS_LIMIT = 92;

const REQUEST_TIMEOUT_MS = 8000;

/** Past weather cannot change, so it is cached far longer than a forecast. */
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const FORECAST_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 300;

/**
 * The daily fields we ask for, in the order the response arrays come back.
 * Defaults suit us as-is: °C, mm, km/h — no unit parameters needed.
 */
const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "wind_speed_10m_max",
].join(",");

/** One day as Open-Meteo returns it, already unpacked from the parallel arrays. */
interface DailyWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  rainfallMm: number;
  windMaxKph: number;
  weatherCode: number;
}

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

// Same shape of cache as the Nominatim proxy in geo.controller.ts: a Map used
// as an LRU, oldest evicted first once it fills. Kept local rather than shared
// because the two have different lifetimes and neither is hot enough to justify
// a general-purpose cache layer nobody would be able to explain in one breath.
const cache = new Map<string, { at: number; ttl: number; value: DailyWeather[] }>();

function readCache(key: string): DailyWeather[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: DailyWeather[], ttl: number) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttl, value });
}

/** Today's Dhaka calendar day — the reference point for "how far back". */
function today(): string {
  return dhakaDateKey(new Date());
}

/** Whole days between two "YYYY-MM-DD" keys (positive when `a` is later). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Rounds coordinates to ~1 km before they become a cache key. Weather does not
 * differ meaningfully across a building plot, and two projects on the same road
 * should share one lookup rather than each spending a request.
 */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Turns Open-Meteo's parallel arrays into one row per day, dropping gaps. */
function parseDaily(body: OpenMeteoResponse): DailyWeather[] {
  const daily = body.daily;
  if (!daily?.time) return [];

  const rows: DailyWeather[] = [];
  daily.time.forEach((date, i) => {
    const code = daily.weather_code?.[i];
    const tempMax = daily.temperature_2m_max?.[i];
    const tempMin = daily.temperature_2m_min?.[i];
    const rain = daily.precipitation_sum?.[i];
    const wind = daily.wind_speed_10m_max?.[i];

    // A day with no temperature reading is a gap in the model, not a dry day —
    // skip it rather than recording zeroes that would read as real measurements.
    if (typeof tempMax !== "number" || typeof tempMin !== "number") return;

    rows.push({
      date,
      tempMaxC: Math.round(tempMax * 10) / 10,
      tempMinC: Math.round(tempMin * 10) / 10,
      // Rainfall and wind do legitimately come back as 0, so only a missing
      // value falls back — and it falls back to 0 because "no precipitation
      // reported" is what a null means on these two fields.
      rainfallMm: typeof rain === "number" ? Math.round(rain * 10) / 10 : 0,
      windMaxKph: typeof wind === "number" ? Math.round(wind) : 0,
      weatherCode: typeof code === "number" ? code : 0,
    });
  });
  return rows;
}

/**
 * Fetches a date range from whichever endpoint covers it. Throws on network or
 * API failure — callers decide whether that should fail their request.
 */
async function fetchRange(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<{ rows: DailyWeather[]; source: WeatherSource }> {
  // The oldest date in the range decides the endpoint: if it is beyond the
  // forecast model's reach, the whole range has to come from the archive.
  const age = daysBetween(today(), startDate);
  const source = age > FORECAST_PAST_DAYS_LIMIT ? WeatherSource.ARCHIVE : WeatherSource.FORECAST;
  const base =
    source === WeatherSource.ARCHIVE ? env.OPEN_METEO_ARCHIVE_URL : env.OPEN_METEO_FORECAST_URL;

  const key = `${source}:${coordKey(lat, lng)}:${startDate}:${endDate}`;
  const cached = readCache(key);
  if (cached) return { rows: cached, source };

  const query = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: DAILY_FIELDS,
    timezone: "Asia/Dhaka",
    start_date: startDate,
    end_date: endDate,
  });

  const res = await fetch(`${base}?${query.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await res.json().catch(() => null)) as OpenMeteoResponse | null;
  if (!res.ok || !body || body.error) {
    // Open-Meteo explains itself in `reason` ("Value cannot be after
    // 2026-08-12" and the like), which is worth having in the log.
    console.error(`[weather] Open-Meteo ${res.status}: ${body?.reason ?? "no body"}`);
    throw new Error("Couldn't reach the weather service");
  }

  const rows = parseDaily(body);
  // A range ending today or later still has hours left to change; anything
  // wholly in the past is settled and can be held much longer.
  const ttl = daysBetween(today(), endDate) > 0 ? HISTORY_TTL_MS : FORECAST_TTL_MS;
  writeCache(key, rows, ttl);
  return { rows, source };
}

/**
 * The weather over a plot on one Dhaka calendar day, ready to stamp onto a
 * diary entry. Returns undefined when the service has no reading for that date
 * — the entry is still worth saving without it.
 */
export async function getWeatherForDate(
  lat: number,
  lng: number,
  dateKey: string
): Promise<WeatherSnapshot | undefined> {
  const { rows, source } = await fetchRange(lat, lng, dateKey, dateKey);
  const day = rows.find((r) => r.date === dateKey) ?? rows[0];
  if (!day) return undefined;

  return {
    tempMaxC: day.tempMaxC,
    tempMinC: day.tempMinC,
    rainfallMm: day.rainfallMm,
    windMaxKph: day.windMaxKph,
    weatherCode: day.weatherCode,
    description: weatherDescription(day.weatherCode),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * The next `days` days over a plot, for the strip above the diary. Starts today
 * so the site can see whether this afternoon's pour is still on.
 */
export async function getForecast(
  lat: number,
  lng: number,
  days: number
): Promise<WeatherForecastDay[]> {
  const start = today();
  const end = dhakaDateKey(new Date(Date.parse(`${start}T00:00:00Z`) + (days - 1) * 86_400_000));

  const { rows } = await fetchRange(lat, lng, start, end);
  return rows.map((day) => ({
    date: day.date,
    tempMaxC: day.tempMaxC,
    tempMinC: day.tempMinC,
    rainfallMm: day.rainfallMm,
    windMaxKph: day.windMaxKph,
    weatherCode: day.weatherCode,
    description: weatherDescription(day.weatherCode),
    advisory: weatherAdvisory(day.rainfallMm, day.windMaxKph),
  }));
}
