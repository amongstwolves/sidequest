"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type NavTab } from "@/lib/demo/nav";

/** Phone navigation for the signed-in role; the header links take over from md up. */
export function MobileTabBar({ tabs }: { tabs: NavTab[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[1100] border-t border-surface-2 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = isActive(t, path);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop header links for the signed-in role. */
export function HeaderLinks({ tabs }: { tabs: NavTab[] }) {
  const path = usePathname();
  return (
    <span className="hidden items-center gap-5 md:flex">
      {tabs
        .filter((t) => t.href !== "/start")
        .map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(t, path) ? "page" : undefined}
            className={`text-sm hover:text-foreground ${isActive(t, path) ? "text-foreground" : "text-muted"}`}
          >
            {t.label === "Control" ? "Mission Control" : t.label === "New" ? "New objective" : t.label}
          </Link>
        ))}
    </span>
  );
}
