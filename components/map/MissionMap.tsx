"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";

// Served from public/ (copied there on install by scripts/copy-map-worker.mjs).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  kind: "mission" | "operator";
  label: string;
  sub?: string;
  href?: string;
  /** Operators: inside radius, available and skilled. */
  eligible?: boolean;
  /** Operators: service radius in meters, drawn as a circle. */
  radius?: number;
  /** The viewer (current operator) or the focused mission. */
  highlight?: boolean;
  /** Missions: reward label shown on the pin. */
  reward?: string;
};

// OpenFreeMap: free OpenStreetMap vector tiles, no key or account.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const ACCENT = "#6ee7b7";
const MUTED = "#64748b";
const SELF = "#7dd3fc";

// The demo's fictional neighborhoods (db/seed.sql), labelled near their seeded operators and venues.
const NEIGHBORHOODS = [
  { name: "Northgate Mill", lat: 35.2515, lng: -80.8095 },
  { name: "Southline", lat: 35.2035, lng: -80.86 },
  { name: "Elm Plaza", lat: 35.2165, lng: -80.813 },
  { name: "Old Depot", lat: 35.2335, lng: -80.8465 },
  { name: "Riverside Yard", lat: 35.1545, lng: -80.905 },
];

let styleCache: Promise<StyleSpecification> | null = null;

/**
 * Load the dark style and drop real place-name labels (cities, suburbs, neighborhoods); the style
 * has no business/POI layer. Street and water names stay, so the map reads as a real map while
 * no real brand or neighborhood name appears next to the fictional demo venues.
 */
function loadStyle(): Promise<StyleSpecification> {
  styleCache ??= fetch(STYLE_URL)
    .then((r) => r.json() as Promise<StyleSpecification>)
    .then((style) => ({
      ...style,
      layers: style.layers.filter((l) => !("source-layer" in l && l["source-layer"] === "place")),
    }));
  return styleCache;
}

/** Polygon approximating a circle of `meters` around a point (64 segments). */
function circle(lng: number, lat: number, meters: number): [number, number][] {
  const coords: [number, number][] = [];
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return coords;
}

function el(className: string, text: string): HTMLElement {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  return div;
}

function popupNode(title: string, sub?: string, href?: string): HTMLElement {
  const root = document.createElement("div");
  root.appendChild(el("sq-pop-title", title));
  if (sub) root.appendChild(el("sq-pop-sub", sub));
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = "Open mission →";
    a.className = "sq-pop-link";
    root.appendChild(a);
  }
  return root;
}

export default function MissionMap({ points, className = "h-72" }: { points: MapPoint[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    const markers: maplibregl.Marker[] = [];
    let resizeObserver: ResizeObserver | null = null;

    loadStyle().then((style) => {
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style,
        center: points.length ? [points[0].lng, points[0].lat] : [-80.843, 35.227],
        zoom: 12,
        minZoom: 10,
        maxZoom: 17,
        attributionControl: { compact: true, customAttribution: "OpenFreeMap" },
        cooperativeGestures: true, // one finger scrolls the page; two fingers move the map
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      const m = map;

      m.on("load", () => {
        // Keep the credit behind its (i) button so it doesn't cover the map on phones.
        m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        const operators = points.filter((p) => p.kind === "operator");
        const areas = operators.filter((p) => p.radius && (p.highlight || p.eligible));

        m.addSource("areas", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: areas.map((p) => ({
              type: "Feature",
              properties: { self: Boolean(p.highlight) },
              geometry: { type: "Polygon", coordinates: [circle(p.lng, p.lat, p.radius!)] },
            })),
          },
        });
        m.addLayer({
          id: "area-fill",
          type: "fill",
          source: "areas",
          paint: { "fill-color": ["case", ["get", "self"], SELF, ACCENT], "fill-opacity": ["case", ["get", "self"], 0.1, 0.05] },
        });
        m.addLayer({ id: "area-line-self", type: "line", source: "areas", filter: ["get", "self"], paint: { "line-color": SELF, "line-width": 1.5, "line-opacity": 0.8 } });
        m.addLayer({
          id: "area-line",
          type: "line",
          source: "areas",
          filter: ["!", ["get", "self"]],
          paint: { "line-color": ACCENT, "line-width": 1, "line-opacity": 0.6, "line-dasharray": [3, 3] },
        });

        m.addSource("operators", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: operators.map((p) => ({
              type: "Feature",
              properties: { label: p.label, sub: p.sub ?? "", color: p.highlight ? SELF : p.eligible ? ACCENT : MUTED, size: p.highlight ? 8 : 6 },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            })),
          },
        });
        m.addLayer({
          id: "operators",
          type: "circle",
          source: "operators",
          paint: { "circle-color": ["get", "color"], "circle-radius": ["get", "size"], "circle-stroke-color": "#0c111b", "circle-stroke-width": 2 },
        });
        const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "sq-popup" });
        const show = (e: maplibregl.MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f || f.geometry.type !== "Point") return;
          m.getCanvas().style.cursor = "pointer";
          hover.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(popupNode(String(f.properties.label), String(f.properties.sub))).addTo(m);
        };
        m.on("mouseenter", "operators", show);
        m.on("click", "operators", show);
        m.on("mouseleave", "operators", () => {
          m.getCanvas().style.cursor = "";
          hover.remove();
        });

        for (const n of NEIGHBORHOODS) {
          markers.push(new maplibregl.Marker({ element: el("sq-hood", n.name) }).setLngLat([n.lng, n.lat]).addTo(m));
        }
        for (const p of points.filter((x) => x.kind === "mission")) {
          const pin = el(`sq-pin${p.highlight ? " sq-pin-focus" : ""}`, p.reward ?? "●");
          markers.push(
            new maplibregl.Marker({ element: pin, anchor: "bottom" })
              .setLngLat([p.lng, p.lat])
              .setPopup(new maplibregl.Popup({ offset: 18, className: "sq-popup" }).setDOMContent(popupNode(p.label, p.sub, p.href)))
              .addTo(m),
          );
        }

        if (points.length) {
          const bounds = new maplibregl.LngLatBounds();
          for (const p of points) bounds.extend([p.lng, p.lat]);
          for (const p of areas) for (const c of circle(p.lng, p.lat, p.radius!)) bounds.extend(c);
          const fit = () => {
            m.resize();
            m.fitBounds(bounds, { padding: 28, maxZoom: 15, duration: 0 });
          };
          fit();
          // The box can settle after first paint (fonts, streaming content); re-fit when it does.
          resizeObserver = new ResizeObserver(() => fit());
          resizeObserver.observe(m.getContainer());
        }
      });
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markers.forEach((mk) => mk.remove());
      map?.remove();
    };
  }, [points]);

  return <div ref={container} className={`overflow-hidden rounded-xl border border-surface-2 bg-[#0f1724] ${className}`} />;
}
