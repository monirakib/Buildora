"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polygon, Polyline } from "leaflet";
import type { GeoAddress, GeoPlace, LatLng, PlotLocation } from "@buildora/shared";
import { reverseGeocode, searchPlaces } from "@/lib/apiGeo";
import { useSession } from "@/store/useSession";
import "leaflet/dist/leaflet.css";

/**
 * The plot picker on the brief form: search for a place, drop a pin on the
 * plot, and optionally trace its outline so we can work out the land size.
 *
 * The map is Leaflet drawing OpenStreetMap tiles (free, no API key). Address
 * lookups go through our own /api/geo endpoints. Leaflet is loaded with a
 * dynamic import inside an effect because it touches `window` as soon as it is
 * imported, which would crash while Next renders this page on the server.
 */

/** Dhaka — where the map opens when the owner hasn't picked anything yet. */
const DEFAULT_CENTER: LatLng = { lat: 23.8103, lng: 90.4125 };
const DEFAULT_ZOOM = 12;
const PICKED_ZOOM = 17;

const SQFT_PER_SQM = 10.7639;
/** The Bangladeshi katha: 720 square feet. */
const SQFT_PER_KATHA = 720;
/**
 * Anything past this is a neighbourhood, not a plot — it means the corners were
 * tapped on a zoomed-out map. We still show the number, but we don't let it
 * overwrite the land size the owner typed.
 */
const MAX_PLAUSIBLE_KATHA = 500;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Area of a polygon drawn on the globe, in square metres. This is the standard
 * spherical-excess sum: walk the edges, add up how much each one sweeps, and
 * scale by the earth's radius. Flat-plane geometry would be off by enough to
 * matter once you convert to katha.
 */
function polygonAreaSqM(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const R = 6378137; // earth's radius in metres
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += toRad(b.lng - a.lng) * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)));
  }
  return Math.abs((sum * R * R) / 2);
}

/** Average of the corners — good enough to drop the pin inside the outline. */
function centreOf(points: LatLng[]): LatLng {
  const lat = points.reduce((t, p) => t + p.lat, 0) / points.length;
  const lng = points.reduce((t, p) => t + p.lng, 0) / points.length;
  return { lat, lng };
}

export interface PlotMapPickerProps {
  value: PlotLocation | null;
  onChange: (value: PlotLocation | null) => void;
  /** Fires when a pin resolves to an address, so the form can prefill fields. */
  onAddress?: (address: GeoAddress) => void;
  /** Fires with the land size in katha once an outline encloses an area. */
  onAreaKatha?: (katha: number) => void;
}

export function PlotMapPicker({ value, onChange, onAddress, onAreaKatha }: PlotMapPickerProps) {
  const token = useSession((s) => s.token);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // The Leaflet module itself, kept once it has finished loading.
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const shapeRef = useRef<Polygon | Polyline | null>(null);
  const vertexRef = useRef<Marker[]>([]);

  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(value ? { lat: value.lat, lng: value.lng } : null);
  const [boundary, setBoundary] = useState<LatLng[]>(value?.boundary ?? []);
  const [drawing, setDrawing] = useState(false);
  const [address, setAddress] = useState<string | undefined>(value?.formattedAddress);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  // Handlers registered on Leaflet objects live as long as the map does, so they
  // would capture whatever props existed on the first render. Reading them from
  // refs keeps every callback pointed at the latest version.
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  // The token arrives a moment after mount, once the stored session rehydrates.
  // Reading it from a ref keeps the map's click handler — created once — from
  // being stuck with the `null` it saw on the very first render.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;
  const onAreaKathaRef = useRef(onAreaKatha);
  onAreaKathaRef.current = onAreaKatha;

  const areaSqM = polygonAreaSqM(boundary);
  const areaSqft = areaSqM * SQFT_PER_SQM;
  const areaKatha = areaSqft / SQFT_PER_KATHA;
  const outlineTooBig = boundary.length >= 3 && areaKatha > MAX_PLAUSIBLE_KATHA;

  // ---- Tell the form what has been picked ----
  // Deliberately keyed on the picked values only: `onChange` is usually an
  // inline arrow that changes identity on every parent render, and including it
  // here would make this effect run forever.
  useEffect(() => {
    if (!pin) {
      onChangeRef.current(null);
      return;
    }
    onChangeRef.current({
      lat: pin.lat,
      lng: pin.lng,
      formattedAddress: address,
      boundary: boundary.length >= 3 ? boundary : undefined,
      boundaryAreaSqft: boundary.length >= 3 ? Math.round(areaSqft) : undefined,
    });
  }, [pin, boundary, address, areaSqft]);

  /** Looks up the address at a point and hands it to the form. */
  const lookUpAddress = useCallback(async (point: LatLng) => {
    const current = tokenRef.current;
    if (!current) return;
    setLooking(true);
    setError(null);
    try {
      const found = await reverseGeocode(current, point.lat, point.lng);
      setAddress(found.formattedAddress);
      onAddressRef.current?.(found);
    } catch (err) {
      // A missing address isn't fatal — the pin is still valid, so say so
      // quietly and let the owner type the address themselves.
      setAddress(undefined);
      setError(err instanceof Error ? err.message : "Couldn't find that address");
    } finally {
      setLooking(false);
    }
  }, []);

  /** Moves the pin and (unless told otherwise) looks the new address up. */
  const placePin = useCallback(
    (point: LatLng, lookUp = true) => {
      setPin(point);
      if (lookUp) void lookUpAddress(point);
    },
    [lookUpAddress]
  );

  // ---- Create the map once ----
  useEffect(() => {
    let cancelled = false;

    async function start() {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const opening = value ? { lat: value.lat, lng: value.lng } : DEFAULT_CENTER;
      const map = L.map(containerRef.current, {
        center: [opening.lat, opening.lng],
        zoom: value ? PICKED_ZOOM : DEFAULT_ZOOM,
        // The page scrolls a long way; leave the wheel to the page and let
        // people zoom with the +/- buttons or a pinch.
        scrollWheelZoom: false,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // The object form of `on` is what gives `e` its mouse-event type.
      map.on({
        click: (e) => {
          const point = { lat: e.latlng.lat, lng: e.latlng.lng };
          if (drawingRef.current) {
            setBoundary((corners) => [...corners, point]);
          } else {
            placePin(point);
          }
        },
      });

      mapRef.current = map;
      setReady(true);
    }

    void start();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Runs once: `value` is only read for the opening view, and re-running this
    // would tear the map down under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Keep the pin marker in sync with `pin` ----
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      // A divIcon instead of Leaflet's default marker image: it needs no image
      // file from the bundler and can be styled with the app's colours.
      const icon = L.divIcon({
        className: "",
        html: '<div class="h-5 w-5 -translate-x-1/2 -translate-y-full rounded-full border-[3px] border-white bg-amber-500 shadow-lg shadow-black/40"></div>',
        iconSize: [0, 0],
      });
      const marker = L.marker([pin.lat, pin.lng], { icon, draggable: true }).addTo(map);
      marker.on({
        dragend: () => {
          const p = marker.getLatLng();
          placePin({ lat: p.lat, lng: p.lng });
        },
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    }
  }, [pin, ready, placePin]);

  // ---- Redraw the outline and its draggable corners ----
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    shapeRef.current?.remove();
    shapeRef.current = null;
    for (const m of vertexRef.current) m.remove();
    vertexRef.current = [];

    if (boundary.length === 0) return;

    const style = { color: "#f59e0b", weight: 3, fillColor: "#f59e0b", fillOpacity: 0.2 };
    // Two corners can only be a line; three or more closes into a shape.
    shapeRef.current =
      boundary.length >= 3
        ? L.polygon(boundary, style).addTo(map)
        : L.polyline(boundary, style).addTo(map);

    const cornerIcon = L.divIcon({
      className: "",
      html: '<div class="h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 bg-white"></div>',
      iconSize: [0, 0],
    });
    boundary.forEach((corner, index) => {
      const handle = L.marker(corner, { icon: cornerIcon, draggable: true }).addTo(map);
      // Only on dragend: this effect rebuilds every handle, so reacting to each
      // drag frame would yank the marker out from under the pointer.
      handle.on({
        dragend: () => {
          const p = handle.getLatLng();
          setBoundary((corners) =>
            corners.map((c, i) => (i === index ? { lat: p.lat, lng: p.lng } : c))
          );
        },
      });
      vertexRef.current.push(handle);
    });
  }, [boundary, ready]);

  // ---- Report the traced size, and drop a pin if there isn't one ----
  useEffect(() => {
    if (boundary.length < 3) return;
    // Only a believable plot size gets to overwrite the land size on the form.
    if (areaKatha <= MAX_PLAUSIBLE_KATHA) onAreaKathaRef.current?.(areaKatha);
    setPin((current) => current ?? centreOf(boundary));
  }, [boundary, areaKatha]);

  // ---- Search box, debounced so we don't hammer the geocoder ----
  useEffect(() => {
    const q = query.trim();
    if (!token || q.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await searchPlaces(token, q, controller.signal));
      } catch {
        // An aborted or failed search just shows nothing; the map still works.
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, token]);

  /** Jumps the map to a searched place and pins it. */
  function choosePlace(place: GeoPlace) {
    setQuery("");
    setSuggestions([]);
    mapRef.current?.setView([place.lat, place.lng], PICKED_ZOOM);
    // The search result already carries the address, so skip the extra lookup.
    setPin({ lat: place.lat, lng: place.lng });
    setAddress(place.label);
    onAddressRef.current?.({ formattedAddress: place.label, areaName: place.areaName });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError("This browser can't share your location");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.setView([point.lat, point.lng], PICKED_ZOOM);
        placePin(point);
      },
      () => setError("Couldn't get your location, pick the plot on the map instead")
    );
  }

  function clearAll() {
    setPin(null);
    setBoundary([]);
    setAddress(undefined);
    setDrawing(false);
    setError(null);
  }

  const buttonClass =
    "rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-700 transition hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:text-slate-200 dark:hover:border-amber-400 dark:hover:text-amber-300";
  const activeButtonClass =
    "rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-amber-400 transition dark:bg-amber-400 dark:text-stone-950";

  return (
    // `isolate` traps Leaflet's own z-indexes (its controls sit at 1000) inside
    // this card so they can't paint over the fixed navbar.
    <div className="relative isolate">
      {/* Search */}
      <div className="relative z-[1100]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, “Dhanmondi Road 5”, “Bashundhara Block C”…"
          className="block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10"
        />
        {(suggestions.length > 0 || searching) && (
          <ul className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-64 overflow-auto rounded-xl border border-stone-200 bg-white shadow-xl dark:border-white/15 dark:bg-stone-900">
            {searching && suggestions.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-stone-500 dark:text-slate-400">Searching…</li>
            )}
            {suggestions.map((place) => (
              <li key={`${place.lat},${place.lng}`}>
                <button
                  type="button"
                  onClick={() => choosePlace(place)}
                  className="block w-full px-4 py-2.5 text-left text-sm text-stone-700 transition hover:bg-amber-400/15 dark:text-slate-200"
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        // Leaflet needs a real height on its container or the map renders 0px tall.
        className="mt-3 h-[20rem] w-full rounded-2xl border border-stone-300/70 bg-stone-100 sm:h-[24rem] dark:border-white/15 dark:bg-white/5 dark:[&_.leaflet-tile]:brightness-90 dark:[&_.leaflet-tile]:contrast-[1.05]"
      />

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={locateMe} className={buttonClass}>
          Use my location
        </button>
        <button
          type="button"
          onClick={() => setDrawing((d) => !d)}
          className={drawing ? activeButtonClass : buttonClass}
        >
          {drawing ? "✓ Done tracing" : boundary.length > 0 ? "Keep tracing" : "Trace plot outline"}
        </button>
        {boundary.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setBoundary((c) => c.slice(0, -1))}
              className={buttonClass}
            >
              Undo corner
            </button>
            <button type="button" onClick={() => setBoundary([])} className={buttonClass}>
              Clear outline
            </button>
          </>
        )}
        {pin && (
          <button type="button" onClick={clearAll} className={buttonClass}>
            Remove pin
          </button>
        )}
      </div>

      {/* What's been picked */}
      <div className="mt-3 rounded-xl bg-stone-500/5 px-4 py-3 text-sm dark:bg-white/5">
        {drawing ? (
          <p className="font-semibold text-amber-600 dark:text-amber-400">
            Tracing: tap each corner of the plot, then press “Done tracing”.
            {boundary.length > 0 &&
              ` ${boundary.length} corner${boundary.length === 1 ? "" : "s"} so far.`}
            {boundary.length >= 3 && ` About ${areaKatha.toFixed(2)} katha.`}
          </p>
        ) : pin ? (
          <>
            <p className="font-semibold">
              {looking ? "Finding the address…" : (address ?? "Pin dropped")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-stone-500 dark:text-slate-400">
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              {boundary.length >= 3 &&
                ` · outline ${areaKatha.toFixed(2)} katha (${Math.round(areaSqft).toLocaleString("en-IN")} sqft)`}
            </p>
          </>
        ) : (
          <p className="text-stone-600 dark:text-slate-400">
            Search above, tap the map, or use your location to drop a pin on the plot.
          </p>
        )}
        {outlineTooBig && (
          <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {/* One template literal, so the spacing can't be eaten by JSX's
                whitespace trimming the way plain multi-line text is. */}
            {`That outline covers ${Math.round(areaKatha).toLocaleString("en-IN")} katha, far larger than a plot, so the land size hasn't been filled in. Zoom in and trace the corners again.`}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>
    </div>
  );
}
