import { formatUsd } from "@/lib/money";

const STATE_STYLES: Record<string, string> = {
  REJECTED_POLICY: "bg-error/15 text-error",
  CANCELLED: "bg-error/15 text-error",
  PAYMENT_FAILED: "bg-error/15 text-error",
  AWAITING_APPROVAL: "bg-warning/15 text-warning",
  VALIDATING: "bg-warning/15 text-warning",
  CHANGES_REQUESTED: "bg-warning/15 text-warning",
  PUBLISHED: "bg-accent/15 text-accent",
  ACCEPTED: "bg-sky-400/15 text-sky-300",
  IN_PROGRESS: "bg-sky-400/15 text-sky-300",
  PAID: "bg-accent/15 text-accent",
  COMPLETED: "bg-accent/15 text-accent",
};

export function StateBadge({ state }: { state: string }) {
  const label = state.replaceAll("_", " ").toLowerCase();
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATE_STYLES[state] ?? "bg-surface-2 text-muted"}`}>
      {label}
    </span>
  );
}

export function Money({ minor, className = "" }: { minor: number; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{formatUsd(minor)}</span>;
}

export function AiBadge({ ai }: { ai: boolean }) {
  return ai ? (
    <span className="rounded border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
      AI-created
    </span>
  ) : null;
}

export function Card({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function formatDeadline(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(d);
}
