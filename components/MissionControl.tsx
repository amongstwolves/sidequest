"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDark,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import type { ActivityGridRow, MissionGridRow } from "@/lib/control";

ModuleRegistry.registerModules([AllCommunityModule]);

// Palette tokens from the spec (§11.1), so the grids read as part of the app.
const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#192536",
  chromeBackgroundColor: "#24344b",
  oddRowBackgroundColor: "#1c2a3d",
  foregroundColor: "#ffffff",
  headerTextColor: "#94a3b8",
  borderColor: "#24344b",
  accentColor: "#6ee7b7",
  selectedRowBackgroundColor: "#24344b",
  fontFamily: "var(--font-geist-sans)",
  fontSize: 13,
  headerFontWeight: 600,
  spacing: 6,
  wrapperBorderRadius: 12,
  browserColorScheme: "dark",
});

const usd = (p: ValueFormatterParams) => (p.value == null ? "" : `$${(p.value / 100).toFixed(2)}`);
const time = (p: ValueFormatterParams) =>
  p.value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" }).format(new Date(p.value))
    : "";
const label = (p: ValueFormatterParams) => (p.value ? String(p.value).replaceAll("_", " ").toLowerCase() : "—");

const STATE_CLASS: Record<string, string> = {
  PAID: "text-accent",
  PASS_RECOMMENDED: "text-accent",
  SUCCESS: "text-accent",
  PUBLISHED: "text-accent",
  CHANGES_REQUESTED: "text-warning",
  UNDER_REVIEW: "text-warning",
  PAYOUT_PENDING: "text-warning",
  PAYMENT_PENDING: "text-warning",
  PAYMENT_FAILED: "text-error",
  REJECTED_POLICY: "text-error",
};
const stateClass = (p: { value: unknown }) => STATE_CLASS[String(p.value)] ?? "";

function MissionLink(p: ICellRendererParams<MissionGridRow>) {
  return p.data ? (
    <Link href={`/missions/${p.data.id}`} className="font-medium hover:text-accent hover:underline">
      {p.value}
    </Link>
  ) : null;
}

function Mono(p: ICellRendererParams) {
  return p.value ? <span className="font-mono text-xs">{p.value}</span> : <span className="text-muted">—</span>;
}

const ACTORS = [
  { key: "all", label: "All" },
  { key: "human", label: "Human" },
  { key: "agent", label: "AI agent" },
  { key: "system", label: "System" },
  { key: "provider", label: "PayPal" },
] as const;

const ACTOR_CLASS: Record<string, string> = {
  human: "text-sky-300",
  agent: "text-accent",
  system: "text-muted",
  provider: "text-warning",
};

export function MissionsGrid({ rows }: { rows: MissionGridRow[] }) {
  const columns = useMemo<ColDef<MissionGridRow>[]>(
    () => [
      { field: "title", headerName: "Mission", cellRenderer: MissionLink, minWidth: 240, flex: 2, pinned: "left" },
      { field: "location", headerName: "Location", minWidth: 110 },
      { field: "operator", headerName: "Operator", minWidth: 140, valueFormatter: (p) => p.value ?? "unassigned" },
      { field: "state", headerName: "Status", minWidth: 150, valueFormatter: label, cellClass: stateClass },
      { field: "review", headerName: "Proof review", minWidth: 150, valueFormatter: label, cellClass: stateClass },
      { field: "rewardMinor", headerName: "Reward", minWidth: 100, valueFormatter: usd, type: "rightAligned" },
      { field: "authorizationId", headerName: "PayPal authorization", minWidth: 190, cellRenderer: Mono },
      { field: "captureId", headerName: "PayPal capture", minWidth: 180, cellRenderer: Mono },
      { field: "payoutItemId", headerName: "PayPal payout", minWidth: 160, cellRenderer: Mono },
      { field: "paymentStatus", headerName: "Payment", minWidth: 140, valueFormatter: label, cellClass: stateClass },
      { field: "viaAgent", headerName: "Source", minWidth: 110, valueFormatter: (p) => (p.value ? "AI agent" : "Web") },
      { field: "updatedAt", headerName: "Updated", minWidth: 150, valueFormatter: time, sort: "desc" },
    ],
    [],
  );
  return (
    <div>
      <AgGridReact<MissionGridRow>
        theme={theme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.id}
        domLayout="autoHeight"
        pagination
        paginationPageSize={10}
        paginationPageSizeSelector={[10, 25, 50]}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        overlayNoRowsTemplate="No missions yet. Approve a plan to publish missions."
        animateRows
      />
    </div>
  );
}

export function ActivityGrid({ rows }: { rows: ActivityGridRow[] }) {
  const [actor, setActor] = useState<(typeof ACTORS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const shown = useMemo(() => (actor === "all" ? rows : rows.filter((r) => r.actorType === actor)), [rows, actor]);
  const columns = useMemo<ColDef<ActivityGridRow>[]>(
    () => [
      { field: "at", headerName: "Time", valueFormatter: time, minWidth: 160, sort: "desc" },
      {
        field: "actorType",
        headerName: "Actor type",
        minWidth: 110,
        valueFormatter: (p) => (p.value === "provider" ? "PayPal" : p.value === "agent" ? "AI agent" : p.value),
        cellClass: (p) => ACTOR_CLASS[p.value as string] ?? "",
      },
      { field: "actor", headerName: "Actor", minWidth: 160 },
      { field: "action", headerName: "Event", minWidth: 190, cellRenderer: Mono },
      { field: "subject", headerName: "About", minWidth: 220, flex: 1, tooltipField: "subject" },
      { field: "afterState", headerName: "New state", minWidth: 150, valueFormatter: label, cellClass: stateClass },
      { field: "details", headerName: "Details", minWidth: 280, flex: 2, tooltipField: "details" },
    ],
    [],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by actor type" className="flex flex-wrap gap-1 rounded-full bg-surface p-1">
          {ACTORS.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={actor === a.key}
              onClick={() => setActor(a.key)}
              className={`rounded-full px-3 py-1 text-sm ${actor === a.key ? "bg-accent text-background" : "text-muted hover:text-foreground"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events…"
          aria-label="Search events"
          className="min-w-0 flex-1 rounded-lg border border-surface-2 bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
        />
      </div>
      <div>
        <AgGridReact<ActivityGridRow>
          theme={theme}
          rowData={shown}
          columnDefs={columns}
          getRowId={(p) => String(p.data.id)}
          quickFilterText={search}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          domLayout="autoHeight"
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[20, 50, 100]}
          tooltipShowDelay={300}
          overlayNoRowsTemplate="No events."
        />
      </div>
    </div>
  );
}

/** Polling instead of realtime push (spec §4.4): refresh server data every few seconds. */
export function LiveRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, paused]);
  return (
    <button type="button" onClick={() => setPaused((p) => !p)} className="flex items-center gap-2 text-sm text-muted hover:text-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-muted" : "animate-pulse bg-accent"}`} aria-hidden />
      {paused ? "Live updates paused" : `Live · every ${seconds}s`}
    </button>
  );
}
