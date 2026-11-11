"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "./MissionMap";

export type { MapPoint };

// Leaflet touches `window`, so the map only renders in the browser.
export const LazyMap = dynamic(() => import("./MissionMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-surface" aria-label="Loading map" />,
});
