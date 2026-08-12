import type { LabourTrade, WeatherSource } from "./enums";
import type { UserRef } from "./types";

/**
 * Site diary — the daily record of what happened on a construction site.
 *
 * One entry per project per calendar day (Dhaka time). Whoever is supervising
 * writes down the work done, who was on site, what materials went in, and what
 * held things up. Photos are optional but are what makes the record worth
 * anything in a dispute.
 *
 * The part that isn't typed by hand is the weather: every entry is stamped with
 * the actual conditions over the plot on that day, pulled from Open-Meteo using
 * the pin the owner dropped when they posted the brief. That matters because
 * rain stops concrete and masonry work in Bangladesh for a large part of the
 * year, and "we lost the week to rain" is only an argument if someone wrote the
 * rainfall down at the time. Entries wet enough to stop work are flagged as
 * rain days and counted, so a contractor can point at the tally when a milestone
 * date slips.
 */

/** Rainfall (mm in a day) at or above which outdoor work is treated as lost. */
export const RAIN_DAY_RAINFALL_MM = 10;

/** Rainfall at which work can continue but fresh concrete needs covering. */
export const WET_DAY_RAINFALL_MM = 2.5;

/** Trades counted in the daily headcount. */
export const LABOUR_TRADE_LABELS: Record<LabourTrade, string> = {
  MASON: "Mason",
  HELPER: "Helper",
  STEEL_FIXER: "Steel fixer",
  CARPENTER: "Carpenter",
  ELECTRICIAN: "Electrician",
  PLUMBER: "Plumber",
  PAINTER: "Painter",
  OPERATOR: "Machine operator",
  SUPERVISOR: "Supervisor",
  OTHER: "Other",
};

/** How many people of one trade were on site that day. */
export interface LabourCount {
  trade: LabourTrade;
  count: number;
}

/** One material consumed on the day, in whatever unit the site quotes it in. */
export interface MaterialUsed {
  item: string;
  quantity: number;
  /** "bags", "cft", "kg", "pcs" — free text, because sites are not consistent. */
  unit: string;
}

/**
 * The weather over the plot on one day, as recorded when the entry was written.
 *
 * Stored on the entry rather than fetched on read, deliberately: this is
 * evidence. A forecast that later turns out wrong must not silently rewrite
 * what the site reported at the time, and re-fetching every read would hammer
 * the API for data that cannot change.
 */
export interface WeatherSnapshot {
  tempMaxC: number;
  tempMinC: number;
  rainfallMm: number;
  windMaxKph: number;
  /** WMO 4677 code, as Open-Meteo returns it. */
  weatherCode: number;
  /** Plain-English reading of `weatherCode`. */
  description: string;
  /** Which Open-Meteo endpoint answered — forecast, or the historical archive. */
  source: WeatherSource;
  fetchedAt: string;
}

/** One day's record on a project. */
export interface SiteDiaryEntry {
  id: string;
  projectId: string;
  /** Dhaka calendar day, "YYYY-MM-DD". Unique per project. */
  date: string;
  author: UserRef;
  workDone: string;
  labour: LabourCount[];
  materials: MaterialUsed[];
  equipment?: string;
  /** Blockers — anything that stopped or slowed the work. */
  issues?: string;
  photoUrls: string[];
  /** Absent when the project has no map pin, or the weather lookup failed. */
  weather?: WeatherSnapshot;
  /** Frozen at write time from `weather.rainfallMm`; see RAIN_DAY_RAINFALL_MM. */
  isRainDay: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a writer fills in. The weather is absent on purpose — the server stamps
 * it from the plot's coordinates, so a client can't claim it rained.
 */
export interface SiteDiaryEntryInput {
  date: string;
  workDone: string;
  labour: LabourCount[];
  materials: MaterialUsed[];
  equipment?: string;
  issues?: string;
  photoUrls: string[];
}

/** An edit to an existing entry. The date is fixed once filed. */
export type SiteDiaryEntryEdit = Omit<SiteDiaryEntryInput, "date">;

/** Running totals across a project's diary, for the header strip. */
export interface SiteDiarySummary {
  entryCount: number;
  /** Days flagged as lost to rain — the delay tally a contractor can cite. */
  rainDays: number;
  totalRainfallMm: number;
  /** Sum of every headcount on every entry: a labour-days figure. */
  labourDays: number;
  firstDate?: string;
  lastDate?: string;
}

/** One day of the forward look shown above the diary. */
export interface WeatherForecastDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  rainfallMm: number;
  windMaxKph: number;
  weatherCode: number;
  description: string;
  /** Set when the rainfall is enough to change what the site should do. */
  advisory?: string;
}

/**
 * WMO 4677 weather codes, as documented by Open-Meteo. Only the codes that
 * occur in Bangladesh are spelled out individually; the snow and freezing
 * ranges collapse into one label each since they will never be seen here.
 */
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

/** Plain-English reading of a WMO code. */
export function weatherDescription(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "Unknown";
}

/** True when the day's rainfall is enough to write it off as a rain day. */
export function isRainDay(rainfallMm: number): boolean {
  return rainfallMm >= RAIN_DAY_RAINFALL_MM;
}

/**
 * What the forecast means for the site, in one line. Returns nothing on a dry
 * day — an advisory on every card would be noise nobody reads.
 */
export function weatherAdvisory(rainfallMm: number, windMaxKph: number): string | undefined {
  if (rainfallMm >= RAIN_DAY_RAINFALL_MM) {
    return "Heavy rain — concrete pour not advised";
  }
  if (rainfallMm >= WET_DAY_RAINFALL_MM) {
    return "Showers likely — keep fresh concrete covered";
  }
  // Lifting stops well before rain does; 40 kph is the usual crane cut-off.
  if (windMaxKph >= 40) {
    return "High wind — hold off on lifting and scaffolding";
  }
  return undefined;
}
