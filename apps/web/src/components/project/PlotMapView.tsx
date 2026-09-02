"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { PlotLocation } from "@buildora/shared";
import "leaflet/dist/leaflet.css";

/**
 * Read-only version of the plot map: shows where the owner pinned the plot and
 * the outline they traced, for everyone reading the brief afterwards. Same
 * dynamic-import trick as PlotMapPicker — Leaflet can't be imported on the
 * server.
 */

const SQFT_PER_KATHA = 720;

export function PlotMapView({ location }: { location: PlotLocation }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [location.lat, location.lng],
        zoom: 17,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: '<div class="h-5 w-5 -translate-x-1/2 -translate-y-full rounded-full border-[3px] border-white bg-amber-500 shadow-lg shadow-black/40"></div>',
        iconSize: [0, 0],
      });
      L.marker([location.lat, location.lng], { icon }).addTo(map);

      if (location.boundary && location.boundary.length >= 3) {
        const outline = L.polygon(location.boundary, {
          color: "#f59e0b",
          weight: 3,
          fillColor: "#f59e0b",
          fillOpacity: 0.2,
        }).addTo(map);
        // Frame the plot rather than guessing a zoom level.
        map.fitBounds(outline.getBounds(), { padding: [24, 24] });
      }

      mapRef.current = map;
    }

    void start();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [location]);

  const katha = location.boundaryAreaSqft ? location.boundaryAreaSqft / SQFT_PER_KATHA : null;

  return (
    // `isolate` keeps Leaflet's z-indexes from painting over the fixed navbar.
    <div className="relative isolate">
      <div
        ref={containerRef}
        className="h-64 w-full rounded-2xl border border-stone-300/70 bg-stone-100 dark:border-white/15 dark:bg-white/5 dark:[&_.leaflet-tile]:brightness-90 dark:[&_.leaflet-tile]:contrast-[1.05]"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-slate-400">
        <span className="font-medium">
          {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          {katha && ` · traced outline ${katha.toFixed(2)} katha`}
        </span>
        <a
          href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-amber-700 hover:underline dark:text-amber-400"
        >
          Get directions →
        </a>
      </div>
    </div>
  );
}
