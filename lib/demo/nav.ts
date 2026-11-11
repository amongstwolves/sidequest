// Navigation per role. Shared by the desktop header links and the phone tab bar.

export type NavTab = { href: string; label: string; icon: string; match?: string[] };

const ICON = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  map: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  plus: "M12 5v14M5 12h14",
  chart: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

export const OPERATOR_TABS: NavTab[] = [
  { href: "/me", label: "Home", icon: ICON.home, match: ["/me", "/missions"] },
  { href: "/discover", label: "Map", icon: ICON.map },
  { href: "/start", label: "Profile", icon: ICON.user },
];

export const REQUESTER_TABS: NavTab[] = [
  { href: "/control", label: "Control", icon: ICON.chart, match: ["/control", "/objectives/"] },
  { href: "/objectives/new", label: "New", icon: ICON.plus },
  { href: "/discover", label: "Missions", icon: ICON.map, match: ["/discover", "/missions"] },
  { href: "/start", label: "Profile", icon: ICON.user },
];

export function isActive(tab: NavTab, path: string): boolean {
  // "New objective" lives under /objectives/ but belongs to its own tab.
  if (path === "/objectives/new") return tab.href === "/objectives/new";
  return (tab.match ?? [tab.href]).some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}
