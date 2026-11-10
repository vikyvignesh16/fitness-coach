import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadFirstStrengthDay, loadStrength } from "@/lib/data";
import { formatSessionTime, sessionsByDay, sessionTotals } from "@/lib/strength";
import { addDays, dayMonth, mondayOf, todayLocal, weekdayShort } from "@/lib/weeks";

/** Reads ?week=yyyy-mm-dd (any day of the week) and gives that week's Monday. Anything else means this week. */
function weekStart(value: string | string[] | undefined, today: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return mondayOf(v > today ? today : v);
  return mondayOf(today);
}

/** The Gym tab: the strength sessions your watch recorded, a week at a time. */
export default async function GymPage(props: PageProps<"/gym">) {
  const today = todayLocal();
  const start = weekStart((await props.searchParams).week, today);
  const end = addDays(start, 6);
  const [sessions, first] = await Promise.all([loadStrength(start, end), loadFirstStrengthDay()]);
  const rows = sessionsByDay(sessions);
  const prev = first && start > mondayOf(first) ? addDays(start, -7) : null;
  const next = start < mondayOf(today) ? addDays(start, 7) : null;

  return (
    <>
      <div className="flex items-center justify-between">
        {prev ? (
          <Link href={`/gym?week=${prev}`} aria-label="Previous week" className="flex size-11 items-center justify-center rounded-lg">
            <ChevronLeft aria-hidden className="size-6" />
          </Link>
        ) : <span className="size-11" />}
        <div className="text-center">
          <h1 className="text-xl font-semibold">Gym</h1>
          <p className="text-muted-foreground text-sm">{dayMonth(start)} to {dayMonth(end)}</p>
        </div>
        {next ? (
          <Link href={`/gym?week=${next}`} aria-label="Next week" className="flex size-11 items-center justify-center rounded-lg">
            <ChevronRight aria-hidden className="size-6" />
          </Link>
        ) : <span className="size-11" />}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Your watch recorded no strength sessions this week.</p>
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
                    <div className="min-w-0 flex-1 space-y-1">
                      {row.sessions.map((s) => (
                        <div key={s.id}>
                          <p className="font-medium">{s.workout_name ?? "Strength session"}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {[s.duration_s === null ? null : formatSessionTime(s.duration_s), s.sets.length ? `${sessionTotals(s.sets).sets} sets` : null].filter(Boolean).join(" · ") || "No details"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Badge>{row.sessions.length > 1 ? `${row.sessions.length} sessions` : "Done"}</Badge>
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
