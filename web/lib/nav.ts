export const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/runs", label: "Runs", icon: "runs" },
  { href: "/gym", label: "Gym", icon: "gym" },
  { href: "/food", label: "Food", icon: "food" },
  { href: "/chat", label: "Chat", icon: "chat" },
] as const;

export const MENU_LINKS = [
  { href: "/plan", label: "Training plan" },
  { href: "/checkin", label: "Weekly check in" },
  { href: "/gates/ankle", label: "Ankle check" },
] as const;

/** Home is only active on "/". Other tabs stay active on their sub pages, like /runs/abc. */
export function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
