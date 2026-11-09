"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { TAB_ICONS } from "@/components/tab-icons";
import { Button } from "@/components/ui/button";
import { isActiveTab, MENU_LINKS, TABS } from "@/lib/nav";

const linkClass = (active: boolean) =>
  `flex min-h-10 items-center gap-3 rounded-md px-3 text-sm ${
    active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/60"
  }`;

/** Laptop only (1024px and up). On a phone the bottom tabs and top bar are used instead. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-card sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
      <span className="px-3 pt-2 text-sm font-semibold tracking-wide">ATHLETE</span>
      <nav aria-label="Main" className="space-y-1">
        {TABS.map((tab) => {
          const active = isActiveTab(pathname, tab.href);
          const Icon = TAB_ICONS[tab.icon];
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              <Icon aria-hidden className="size-5" strokeWidth={active ? 2.5 : 1.75} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="More" className="space-y-1 border-t pt-4">
        {MENU_LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <form action={logout} className="mt-auto">
        <Button type="submit" variant="ghost" className="w-full justify-start gap-3 px-3">
          <LogOut aria-hidden className="size-4" /> Sign out
        </Button>
      </form>
    </aside>
  );
}
