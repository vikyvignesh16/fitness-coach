import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { BigStat } from "@/components/big-stat";
import { Card, CardContent } from "@/components/ui/card";
import { loadRuns } from "@/lib/data";
import { formatDuration, formatKm, formatPace } from "@/lib/format";
import { localDate } from "@/lib/runs";
import { filterRuns, parseRange, RANGES, summarise } from "@/lib/runs-stats";
import { dayMonth, todayLocal, weekdayShort } from "@/lib/weeks";

export default async function RunsPage(props: PageProps<"/runs">) {
  const range = parseRange((await props.searchParams).range);
  const today = todayLocal();
  const runs = filterRuns(await loadRuns(), range, today);
  const totals = summarise(runs);

  return (
    <>
      <h1 className="text-xl font-semibold">Runs</h1>

      <nav aria-label="Time range" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
        {RANGES.map((r) => (
          <Link
            key={r.value}
            href={`/runs?range=${r.value}`}
            aria-current={r.value === range ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-md text-sm ${
              r.value === range ? "bg-background font-medium" : "text-muted-foreground"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-3 gap-4">
        <BigStat label="Distance" value={Number(totals.km.toFixed(1))} unit="km" />
        <BigStat label="Runs" value={totals.count} />
        <BigStat label="Time" value={totals.durationS ? formatDuration(totals.durationS) : "0:00"} />
      </div>

      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs in this period.</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => {
            const date = localDate(r.started_at);
            return (
              <li key={r.coros_id}>
                <Link href={`/runs/${r.coros_id}`} className="block">
                  <Card className="hover:bg-muted/40">
                    <CardContent className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-sm">{weekdayShort(date)} {dayMonth(date)}</p>
                        <p className="text-2xl font-bold tabular-nums">{formatKm(r.distance_km)}</p>
                        <p className="text-muted-foreground text-sm tabular-nums">
                          {formatDuration(r.duration_s)} · {formatPace(r.distance_km, r.duration_s)}
                          {r.avg_hr != null && <> · {r.avg_hr} bpm</>}
                        </p>
                      </div>
                      <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
