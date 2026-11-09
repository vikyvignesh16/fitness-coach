"use client";

import { usePathname } from "next/navigation";
import { isWidePage } from "@/lib/nav";

/** The page area. Phone: one narrow column. Laptop: full width for Home and Insights, a readable column elsewhere. */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const wide = isWidePage(usePathname());
  return (
    <main
      className={`mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-10 ${
        wide ? "lg:max-w-6xl" : "lg:max-w-3xl"
      }`}
    >
      {children}
    </main>
  );
}
