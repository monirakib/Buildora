import type { LabourTrade } from "./enums";
import type { LatLng, UserRef } from "./types";

/**
 * Site attendance: who was actually on the plot, and when.
 *
 * The site diary already records a daily headcount, but somebody types it in
 * from memory at the end of the day. This is the same number collected as it
 * happens, from a phone standing on the site — which is why a check-in carries
 * its own coordinates and the distance from the plot pin.
 */

/**
 * Great-circle distance in metres.
 *
 * Lives here rather than in a controller because two features now need it: the
 * milestone inspection records how far the engineer stood from the plot, and a
 * site check-in decides whether somebody is close enough to count as present.
 */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * How far from the plot pin still counts as "on site".
 *
 * Generous on purpose. A plot pin is dropped by hand on a map, phone GPS is
 * routinely 20–50 m out in a city, and a large site's gate can be a long way
 * from its centre. Too tight a radius would reject people who are genuinely
 * standing there, and the cost of that is a foreman who stops using it.
 */
export const SITE_RADIUS_M = 300;

export function isOnSite(pin: LatLng, at: LatLng, radiusM = SITE_RADIUS_M): boolean {
  return distanceMetres(pin, at) <= radiusM;
}

/** One person's attendance on one day. */
export interface SiteCheckIn {
  id: string;
  projectId: string;
  /** The date in Dhaka time, "YYYY-MM-DD" — attendance is counted per day. */
  date: string;
  recordedBy: UserRef;
  trade: LabourTrade;
  /** How many people of this trade this record covers. A ganger checks in a crew. */
  count: number;
  lat: number;
  lng: number;
  /** Metres from the plot pin when it was recorded. */
  distanceFromPlotM?: number;
  /** False when the phone was outside SITE_RADIUS_M — recorded, not rejected. */
  onSite: boolean;
  note?: string;
  checkedInAt: string;
  checkedOutAt?: string;
}

/** The day's totals, which is what the diary pre-fills from. */
export interface AttendanceSummary {
  date: string;
  /** Total heads across every trade. */
  headcount: number;
  byTrade: { trade: LabourTrade; count: number }[];
  /** How many records were taken from outside the site radius. */
  offSiteRecords: number;
}

/* ---------- Delivery routing ---------- */

/**
 * A driving route between two points.
 *
 * Straight-line distance is the wrong number for a delivery — a supplier across
 * a river is 3 km away and an hour's drive — so this is the road route, with
 * the geometry kept so the existing Leaflet map can draw it.
 */
export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  /** The road path, lat/lng ordered ready for Leaflet. */
  polyline: LatLng[];
  routedAt: string;
}

/** What the marketplace shows a buyer about getting their order to the site. */
export interface DeliveryEstimate {
  /** Absent when the supplier hasn't pinned a warehouse, or routing is off. */
  route?: RouteResult;
  /** Why there's no route, in words a buyer can act on. */
  unavailableReason?: string;
  from?: LatLng;
  to?: LatLng;
}
