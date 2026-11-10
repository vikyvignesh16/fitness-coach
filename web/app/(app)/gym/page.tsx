import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadGymWeek, loadStrength } from "@/lib/data";
import { formatSessionTime, gymWeekRows, sessionTotals } from "@/lib/strength";
import { addDays, dayMonth, todayLocal, weekdayShort } from "@/lib/weeks";

function weekNumber(value: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) ? n : null;
}

export default async function GymPage(props: PageProps<"/gym">) {
  const requested = weekNumber((await props.searchParams).week);
  const { weeks, week, locked, sessions } = await loadGymWeek(requested);
  const strength = await loadStrength(week.start_date, addDays(week.start_date, 6));
  const rows = gymWeekRows(week.start_date, sessions.map((s) => s.day), strength);
  const today = todayLocal();
  const index = weeks.findIndex((w) => w.week === week.week);
  const prev = weeks[index - 1];
  const next = weeks[index + 1];

  return (
    <>
      <div className="flex items-center justify-between">
        {prev ? (
          <Link href={`/gym?week=${prev.week}`} aria-label={`Week ${prev.week}`} className="flex size-11 items-center justify-center rounded-lg">
            <ChevronLeft aria-hidden className="size-6" />
          </Link>
        ) : <span className="size-11" />}
        <div className="text-center">
          <h1 className="text-xl font-semibold">Week {week.week}</h1>
          <p className="text-muted-foreground text-sm">{week.phase} · from {dayMonth(week.start_date)}</p>
        </div>
        {next ? (
          <Link href={`/gym?week=${next.week}`} aria-label={`Week ${next.week}`} className="flex size-11 items-center justify-center rounded-lg">
            <ChevronRight aria-hidden className="size-6" />
          </Link>
        ) : <span className="size-11" />}
      </div>

      {locked && (
        <StatusBanner level="careful" title="This week is locked">
          Do the four ankle checks first. <Link href="/gates/ankle" className="text-foreground underline">Open the ankle check</Link>
        </StatusBanner>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No gym sessions planned or recorded this week.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.date}>
              <Link href={`/gym/${row.date}`} className="block">
                <Card className="hover:bg-muted/40">
                  <CardContent className="flex items-center gap-3">
                    <div className="w-14 shrink-0">
                      <p className="font-medium">{weekdayShort(row.date)}</p>
                      <p className="text-muted-foreground text-xs">{dayMonth(row.date)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{row.planned ?? row.sessions[0]?.workout_name ?? "Strength session"}</p>
                      {row.planned === null && <p className="text-muted-foreground text-xs">Not in the plan</p>}
                    </div>
                    {row.sessions.length > 0 ? (
                      <div className="text-right text-sm">
                        <Badge>Done</Badge>
                        <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                          {row.sessions.map((s) => [s.duration_s === null ? null : formatSessionTime(s.duration_s), s.sets.length ? `${sessionTotals(s.sets).sets} sets` : null].filter(Boolean).join(" · ")).join(" + ")}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">{locked ? "Locked" : row.date < today ? "Not recorded" : "Planned"}</span>
                    )}
                    <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
