"use client";

import { Dumbbell, Footprints, House, MessageCircle, Utensils, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveTab, TABS } from "@/lib/nav";

const ICONS: Record<(typeof TABS)[number]["icon"], LucideIcon> = {
  home: House,
  runs: Footprints,
  gym: Dumbbell,
  food: Utensils,
  chat: MessageCircle,
};

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="bg-card fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map((tab) => {
          const active = isActiveTab(pathname, tab.href);
          const Icon = ICONS[tab.icon];
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 1.75} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
