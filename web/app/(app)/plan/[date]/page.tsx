import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBanner } from "@/components/status-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPlanDay } from "@/lib/data";
import { formatDuration, formatKm, formatPace } from "@/lib/format";
import { isRestDay, runLabel } from "@/lib/labels";
import { todayLocal, dayMonth, weekdayShort } from "@/lib/weeks";
import { describeSteps } from "@/lib/workout-steps";

const WATCH_TEXT = {
  waiting: "Not on your watch yet. Approve it on the Approve runs page.",
  queued: "Approved. Waiting to be sent to your COROS watch.",
  sent: "On your COROS calendar and watch.",
  failed: "Sending to the watch failed.",
} as const;

export default async function PlanDayPage(props: PageProps<"/plan/[date]">) {
  const { date } = await props.params;
  const page = await loadPlanDay(date);
  if (!page) notFound();

  const { day, locked, doneRuns, watch } = page;
  const run = day.run;
  const rest = isRestDay(run?.type);
  const steps = locked ? [] : describeSteps(run);
  const showWatch = watch && !locked && (date >= todayLocal() || watch.state !== "waiting");
  const gym = day.gym?.key_exercises?.length ? day.gym : null;

  return (
    <>
      <Link href="/plan" className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Plan
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{weekdayShort(date)} {dayMonth(date)}</h1>
        <p className="text-muted-foreground text-sm">
          Week {day.week}
          {!rest && !locked && <> · {runLabel(run!.type)}, {formatKm(run!.distance_km)}</>}
        </p>
      </div>

      {locked ? (
        <StatusBanner level="careful" title="Locked until the ankle check is passed">
          <Link href="/gates/ankle" className="underline">Open the ankle check</Link>
        </StatusBanner>
      ) : rest ? (
        <p className="text-muted-foreground text-sm">No run planned. Rest from running.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>The workout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {run!.pace_or_effort && <p><span className="text-muted-foreground">Target: </span>{run!.pace_or_effort}</p>}
              {run!.duration_min ? <p><span className="text-muted-foreground">About: </span>{run!.duration_min} min</p> : null}
              {steps.length > 0 && (
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {run!.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{run!.notes}</CardContent>
            </Card>
          )}

          {showWatch && (
            <Card>
              <CardHeader>
                <CardTitle>Watch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {watch.state === "sent" && <Badge className="mr-2">Sent</Badge>}
                  {WATCH_TEXT[watch.state]}
                </p>
                {watch.state === "failed" && watch.error && <p className="text-muted-foreground">{watch.error}</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {doneRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Done</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {doneRuns.map((r) => (
              <Link key={r.coros_id} href={`/runs/${r.coros_id}`} className="hover:bg-muted/40 -mx-2 block rounded-md px-2 py-2">
                <span className="font-medium tabular-nums">{formatKm(r.distance_km)}</span>{" "}
                <span className="text-muted-foreground tabular-nums">
                  in {formatDuration(r.duration_s)}, {formatPace(r.distance_km, r.duration_s)}
                  {r.avg_hr != null && <>, {r.avg_hr} bpm</>}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {gym && !locked && (
        <Link href={`/gym/${date}`} className="hover:bg-muted/40 block rounded-lg border p-4 text-sm">
          <span className="font-medium">Gym: {gym.session}</span>
          <span className="text-muted-foreground"> · {gym.key_exercises.length} exercises</span>
        </Link>
      )}
    </>
  );
}
