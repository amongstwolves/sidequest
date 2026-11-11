"use client";

import { useState } from "react";

/** Map/list toggle for the mission feed (spec §11.3 Discover). Both views are server-rendered. */
export function ViewToggle({ map, list, initial = "map" }: { map: React.ReactNode; list: React.ReactNode; initial?: "map" | "list" }) {
  const [view, setView] = useState<"map" | "list">(initial);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="View" className="inline-flex gap-1 rounded-full bg-surface p-1">
        {(["map", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-1 text-sm capitalize ${view === v ? "bg-accent text-background" : "text-muted hover:text-foreground"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "map" ? map : list}
    </div>
  );
}
