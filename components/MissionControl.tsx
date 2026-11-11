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
    <>
      <MissionCards rows={rows} />
      <div className="hidden md:block">
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
    </>
  );
}

const pretty = (v: string | null) => (v ? v.replaceAll("_", " ").toLowerCase() : "—");
const usdText = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const timeText = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));

/** Phone layout for the missions grid: one card per mission with its PayPal trail. */
function MissionCards({ rows }: { rows: MissionGridRow[] }) {
  if (rows.length === 0) return <p className="rounded-xl bg-surface p-4 text-sm text-muted md:hidden">No missions yet. Approve a plan to publish missions.</p>;
  return (
    <ul className="space-y-3 md:hidden">
      {[...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((r) => (
        <li key={r.id}>
          <Link href={`/missions/${r.id}`} className="block space-y-3 rounded-xl bg-surface p-4 active:bg-surface-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold leading-snug">{r.title}</p>
                <p className="text-sm text-muted">{r.location ?? "—"} · {r.operator ?? "unassigned"}</p>
              </div>
              <span className="shrink-0 font-mono text-accent">{usdText(r.rewardMinor)}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold ${STATE_CLASS[r.state] ?? ""}`}>{pretty(r.state)}</span>
              {r.review && <span className={`rounded-full bg-surface-2 px-2.5 py-0.5 ${STATE_CLASS[r.review] ?? ""}`}>proof: {pretty(r.review)}</span>}
              {r.paymentStatus && <span className={`rounded-full bg-surface-2 px-2.5 py-0.5 ${STATE_CLASS[r.paymentStatus] ?? ""}`}>payment: {pretty(r.paymentStatus)}</span>}
              {r.viaAgent && <span className="rounded-full border border-accent/40 px-2.5 py-0.5 text-accent">AI agent</span>}
            </div>
            {(r.authorizationId || r.captureId || r.payoutItemId) && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {r.authorizationId && (<><dt className="text-muted">Hold</dt><dd className="truncate font-mono">{r.authorizationId}</dd></>)}
                {r.captureId && (<><dt className="text-muted">Capture</dt><dd className="truncate font-mono">{r.captureId}</dd></>)}
                {r.payoutItemId && (<><dt className="text-muted">Payout</dt><dd className="truncate font-mono">{r.payoutItemId}</dd></>)}
              </dl>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Phone layout for the activity log: a compact timeline. */
function ActivityTimeline({ rows }: { rows: ActivityGridRow[] }) {
  const [limit, setLimit] = useState(25);
  if (rows.length === 0) return <p className="rounded-xl bg-surface p-4 text-sm text-muted md:hidden">No events.</p>;
  return (
    <div className="md:hidden">
      <ol className="relative space-y-3 border-l border-surface-2 pl-4">
        {rows.slice(0, limit).map((r) => (
          <li key={r.id} className="relative">
            <span
              className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                r.actorType === "agent" ? "bg-accent" : r.actorType === "provider" ? "bg-warning" : r.actorType === "human" ? "bg-sky-300" : "bg-slate-500"
              }`}
              aria-hidden
            />
            <p className="text-sm">
              <span className={`font-medium ${ACTOR_CLASS[r.actorType] ?? ""}`}>{r.actor}</span>{" "}
              <span className="font-mono text-xs text-muted">{r.action}</span>
              {r.afterState && <span className={`text-xs ${STATE_CLASS[r.afterState] ?? "text-muted"}`}> → {pretty(r.afterState)}</span>}
            </p>
            <p className="line-clamp-2 text-xs text-muted">{r.subject}</p>
            {r.details && <p className="line-clamp-2 text-xs text-muted/80">{r.details}</p>}
            <p className="text-[11px] text-muted/70">{timeText(r.at)}</p>
          </li>
        ))}
      </ol>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 25)} className="mt-3 w-full rounded-lg bg-surface py-2 text-sm text-muted">
          Show more ({rows.length - limit} older)
        </button>
      )}
    </div>
  );
}

export function ActivityGrid({ rows }: { rows: ActivityGridRow[] }) {
  const [actor, setActor] = useState<(typeof ACTORS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const shown = useMemo(() => (actor === "all" ? rows : rows.filter((r) => r.actorType === actor)), [rows, actor]);
  // The phone timeline applies the search itself; the grid uses AG Grid's quick filter.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? shown.filter((r) => `${r.actor} ${r.action} ${r.subject} ${r.details}`.toLowerCase().includes(q)) : shown;
  }, [shown, search]);
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
        <div role="group" aria-label="Filter by actor type" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
          {ACTORS.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={actor === a.key}
              onClick={() => setActor(a.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${actor === a.key ? "bg-accent text-background" : "text-muted hover:text-foreground"}`}
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
      <ActivityTimeline rows={searched} />
      <div className="hidden md:block">
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
