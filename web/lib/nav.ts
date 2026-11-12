export const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/runs", label: "Runs", icon: "runs" },
  { href: "/gym", label: "Gym", icon: "gym" },
  { href: "/food", label: "Food", icon: "food" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/chat", label: "Chat", icon: "chat" },
] as const;

export const MENU_LINKS = [
  { href: "/approve", label: "Approve runs" },
  { href: "/calendar", label: "Calendar" },
  { href: "/plan", label: "Training plan" },
  { href: "/checkin", label: "Weekly check in" },
  { href: "/gates/ankle", label: "Ankle check" },
  { href: "/costs", label: "Costs" },
] as const;

/** Home is only active on "/". Other tabs stay active on their sub pages, like /runs/abc. */
export function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/runs" && (pathname === "/calendar" || pathname.startsWith("/calendar/"))) return true; // the calendar belongs to Runs
  return pathname === href || pathname.startsWith(href + "/");
}

/** Pages that use the full width on a laptop. Everything else keeps a readable column. */
const WIDE_PAGES = ["/", "/insights", "/costs"];

export function isWidePage(pathname: string): boolean {
  return WIDE_PAGES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));
}
