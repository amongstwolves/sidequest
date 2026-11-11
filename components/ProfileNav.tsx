import Link from "next/link";
import { HeaderLinks, MobileTabBar } from "@/components/MobileTabBar";
import { currentPersona, hasChosenPersona } from "@/lib/demo/personas";
import { OPERATOR_TABS, REQUESTER_TABS } from "@/lib/demo/nav";

// These read the profile cookie, so each renders inside <Suspense> (Cache Components).

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Header chip: who you are, and a quick way to switch profile (judges hop between roles here). */
export async function ProfileChip() {
  if (!(await hasChosenPersona())) {
    return (
      <Link href="/start" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-background">
        Sign in
      </Link>
    );
  }
  const p = await currentPersona();
  return (
    <Link
      href="/start"
      className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 text-sm hover:bg-surface-2"
      title="Switch profile"
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-background" aria-hidden>
        {initials(p.name)}
      </span>
      <span className="leading-tight">
        <span className="block font-medium">{p.name}</span>
        <span className="block text-[11px] text-muted">{p.key === "requester" ? "Requester" : "Operator"} · switch</span>
      </span>
    </Link>
  );
}

export function ProfileChipFallback() {
  return <div className="h-9 w-40 rounded-full bg-surface" aria-hidden />;
}

async function tabsForVisitor() {
  if (!(await hasChosenPersona())) return null;
  return (await currentPersona()).key === "requester" ? REQUESTER_TABS : OPERATOR_TABS;
}

export async function RoleHeaderLinks() {
  const tabs = await tabsForVisitor();
  return tabs ? <HeaderLinks tabs={tabs} /> : null;
}

export async function RoleTabBar() {
  const tabs = await tabsForVisitor();
  return tabs ? <MobileTabBar tabs={tabs} /> : null;
}
