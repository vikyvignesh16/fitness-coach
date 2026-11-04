import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BigStat } from "@/components/big-stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadRunDetail } from "@/lib/data";
import { formatDuration, formatKm, formatPace } from "@/lib/format";
import { isRestDay, runLabel } from "@/lib/labels";
import { localDate, matchRunsToDays, plannedKm } from "@/lib/runs";
import { caloriesFrom } from "@/lib/runs-stats";
import { dayMonth, weekdayShort } from "@/lib/weeks";

export default async function RunDetailPage(props: PageProps<"/runs/[id]">) {
  const { id } = await props.params;
  const detail = await loadRunDetail(id);
  if (!detail) notFound();

  const { run, plannedDay, dayRuns } = detail;
  const date = localDate(run.started_at);
  const calories = caloriesFrom(run.raw);
  const planned = plannedDay ? plannedKm(plannedDay) : 0;
  const doneThatDay = matchRunsToDays(dayRuns)[date]?.distanceKm ?? run.distance_km;
  const diff = Math.round((doneThatDay - planned) * 100) / 100;

  return (
    <>
      <Link href="/runs" className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Runs
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{weekdayShort(date)} {dayMonth(date)}</h1>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <BigStat label="Distance" value={Number(run.distance_km.toFixed(2))} unit="km" />
        <BigStat label="Time" value={formatDuration(run.duration_s)} />
        <BigStat label="Pace" value={formatPace(run.distance_km, run.duration_s).replace(" /km", "")} unit="/km" />
        <BigStat label="Heart rate" value={run.avg_hr ?? "-"} unit={run.avg_hr != null ? "bpm" : undefined} />
        {calories != null && <BigStat label="Calories" value={calories} unit="kcal" />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned and done</CardTitle>
          <CardDescription>
            What the plan said for {weekdayShort(date)} {dayMonth(date)}.{" "}
            {plannedDay && !isRestDay(plannedDay.run?.type) && (
              <Link href={`/plan/${date}`} className="underline">See the workout</Link>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {!plannedDay || isRestDay(plannedDay.run?.type) ? (
            <p className="text-muted-foreground">No run was planned for this day.</p>
          ) : (
            <>
              <p><span className="text-muted-foreground">Planned: </span>{runLabel(plannedDay.run!.type)}, {formatKm(planned)}</p>
              <p><span className="text-muted-foreground">Done: </span>{formatKm(doneThatDay)}</p>
              <p>
                {diff === 0 ? "Right on plan." : diff > 0 ? `${formatKm(diff)} more than planned.` : `${formatKm(-diff)} less than planned.`}
              </p>
              {dayRuns.length > 1 && <p className="text-muted-foreground">Total for {dayRuns.length} runs that day.</p>}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">Pace and heart rate charts, laps and personal records come in a later step.</p>
    </>
  );
}
