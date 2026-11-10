import Link from "next/link";
import { insightsHref, LOAD_KINDS, type InsightsRange } from "@/lib/insights-range";

/** Which workouts the training load chart adds up. Kept in the address like the date range. */
export function LoadKindFilter({ range }: { range: InsightsRange }) {
  return (
    <nav aria-label="Workouts" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1 text-xs">
      {LOAD_KINDS.map((k) => (
        <Link key={k.value} href={insightsHref(range, { loadKind: k.value })} aria-current={range.loadKind === k.value ? "true" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-2 text-center ${range.loadKind === k.value ? "bg-background font-medium" : "text-muted-foreground"}`}>
          {k.label}
        </Link>
      ))}
    </nav>
  );
}
