import { DayRow } from "@/components/day-row";
import { Badge } from "@/components/ui/badge";
import { loadDashboardData } from "@/lib/data";
import { formatKm } from "@/lib/format";
import { lockedWeeks } from "@/lib/gates";
import { matchRunsToDays, weeklySeries } from "@/lib/runs";
import { currentWeekNumber, dayMonth, todayLondon } from "@/lib/weeks";

export default async function PlanPage() {
  const { version, weeks, days, runs, ankleGatePassed } = await loadDashboardData();
  const today = todayLondon();
  const current = currentWeekNumber(weeks, today);
  const locks = lockedWeeks(ankleGatePassed);
  const actual = matchRunsToDays(runs);
  const series = weeklySeries(weeks, days, runs);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Plan v{version}</h1>
        <p className="text-muted-foreground text-sm">Paris Marathon, Sunday 4 April 2027. Read only.</p>
      </div>
      <div className="space-y-2">
        {weeks.map((w) => {
          const point = series.find((p) => p.week === w.week)!;
          const locked = locks.includes(w.week);
          return (
            <details key={w.week} open={w.week === current} className="rounded-lg border px-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="font-medium">Week {w.week}</span>
                <span className="text-muted-foreground text-sm">{dayMonth(w.start_date)} · {w.phase}</span>
                <span className="ml-auto text-sm tabular-nums">{formatKm(point.plannedKm)}</span>
                {w.week === current && <Badge>This week</Badge>}
                {locked && <Badge variant="outline">Locked</Badge>}
              </summary>
              <ul className="pb-2">
                {days.filter((d) => d.week === w.week).map((d) => (
                  <DayRow key={d.date} day={d} actual={actual[d.date]} locked={locked} today={d.date === today} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </>
  );
}
