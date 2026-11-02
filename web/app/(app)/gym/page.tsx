import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadGymWeek } from "@/lib/data";
import { dayMonth, weekdayShort } from "@/lib/weeks";

function weekNumber(value: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) ? n : null;
}

export default async function GymPage(props: PageProps<"/gym">) {
  const requested = weekNumber((await props.searchParams).week);
  const { weeks, week, locked, sessions } = await loadGymWeek(requested);
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

      <ul className="space-y-2">
        {sessions.map(({ day, progress, started, finished }) => (
          <li key={day.date}>
            <Link href={`/gym/${day.date}`} className="block">
              <Card className="hover:bg-muted/40">
                <CardContent className="flex items-center gap-3">
                  <div className="w-14 shrink-0">
                    <p className="font-medium">{weekdayShort(day.date)}</p>
                    <p className="text-muted-foreground text-xs">{dayMonth(day.date)}</p>
                  </div>
                  <p className="min-w-0 flex-1 font-medium">{day.gym!.session}</p>
                  {finished ? (
                    <Badge>Finished</Badge>
                  ) : started ? (
                    <span className="text-muted-foreground text-sm tabular-nums">{progress.done} of {progress.total} done</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">{locked ? "Locked" : "Not started"}</span>
                  )}
                  <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
