import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { insightsHref, PRESETS, type InsightsRange, type View } from "@/lib/insights-range";
import { dayMonth } from "@/lib/weeks";

const VIEWS: { value: View; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const segment = (active: boolean) =>
  `flex min-h-11 items-center justify-center rounded-md px-3 text-sm ${active ? "bg-background font-medium" : "text-muted-foreground"}`;

/** The date range and the daily or weekly switch. Everything lives in the address, so it can be bookmarked. */
export function RangeControls({ range, today }: { range: InsightsRange; today: string }) {
  return (
    <section aria-label="Date range" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Time range" className="bg-muted grid flex-1 grid-cols-3 gap-1 rounded-lg p-1 sm:max-w-sm">
          {PRESETS.map((p) => (
            <Link key={p.value} href={insightsHref(range, { preset: p.value })} aria-current={range.preset === p.value ? "true" : undefined} className={segment(range.preset === p.value)}>
              {p.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Daily or weekly" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {VIEWS.map((v) => (
            <Link key={v.value} href={insightsHref(range, { view: v.value })} aria-current={range.view === v.value ? "true" : undefined} className={segment(range.view === v.value)}>
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      <details open={range.preset === "custom"} className="text-sm">
        <summary className="text-muted-foreground min-h-11 cursor-pointer py-2">Custom dates</summary>
        <form method="get" action="/insights" className="flex flex-wrap items-end gap-3 pb-1">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="view" value={range.view} />
          <label className="space-y-1">
            <span className="text-muted-foreground block text-xs">From</span>
            <Input type="date" name="from" defaultValue={range.from} max={today} required />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground block text-xs">To</span>
            <Input type="date" name="to" defaultValue={range.to} max={today} required />
          </label>
          <Button type="submit" variant="secondary" className="min-h-11">Show</Button>
        </form>
      </details>

      <p className="text-muted-foreground text-xs">
        Showing {dayMonth(range.from)} to {dayMonth(range.to)} ({range.days} {range.days === 1 ? "day" : "days"}), {range.view}.
      </p>
      {range.notice && <p role="status" className="text-xs text-amber-400">{range.notice}</p>}
    </section>
  );
}
