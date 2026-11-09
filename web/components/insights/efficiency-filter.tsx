import Link from "next/link";
import { DISTANCES, insightsHref, type InsightsRange } from "@/lib/insights-range";

/** Choose which easy runs the efficiency chart shows, by distance. Kept in the address like the date range. */
export function EfficiencyFilter({ range }: { range: InsightsRange }) {
  return (
    <nav aria-label="Distance" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1 text-xs">
      {DISTANCES.map((d) => (
        <Link key={d.value} href={insightsHref(range, { dist: d.value })} aria-current={range.dist === d.value ? "true" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-2 text-center ${range.dist === d.value ? "bg-background font-medium" : "text-muted-foreground"}`}>
          {d.label}
        </Link>
      ))}
    </nav>
  );
}
