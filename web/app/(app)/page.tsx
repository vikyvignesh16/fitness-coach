import { Watch } from "lucide-react";
import Link from "next/link";
import { BigStat } from "@/components/big-stat";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBanner } from "@/components/status-banner";
import { WeeklyChart } from "@/components/weekly-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadApprovePage, loadDashboardData } from "@/lib/data";
import { formatKm } from "@/lib/format";
import { lockedWeeks } from "@/lib/gates";
import { isRestDay, runLabel } from "@/lib/labels";
import { daysToRace, formatGoalTime } from "@/lib/race";
import { matchRunsToDays, weeklySeries } from "@/lib/runs";
import { currentWeekNumber, todayLondon } from "@/lib/weeks";

export default async function HomePage() {
  const [{ weeks, days, runs, ankleGatePassed, raceDate, targets }, approve] = await Promise.all([
    loadDashboardData(),
    loadApprovePage(7),
  ]);
  const today = todayLondon();
  const weekNo = currentWeekNumber(weeks, today);
  const week = weeks.find((w) => w.week === weekNo)!;
  const locked = lockedWeeks(ankleGatePassed).includes(weekNo);
  const series = weeklySeries(weeks, days, runs);
  const thisWeek = series.find((p) => p.week === weekNo)!;
  const todayPlan = days.find((d) => d.date === today);
  const todayActual = matchRunsToDays(runs)[today];
  const toRace = daysToRace(today, raceDate);

  return (
    <>
      {!ankleGatePassed && (
        <StatusBanner level="careful" title="Week 2 is locked">
          Do the four ankle checks first.{" "}
          <Link href="/gates/ankle" className="text-foreground underline">Open the ankle check</Link>
        </StatusBanner>
      )}

      {approve.waiting > 0 && (
        <StatusBanner level="info" title={`${approve.waiting} ${approve.waiting === 1 ? "run is" : "runs are"} waiting for approval`}>
          <Link href="/approve" className="text-foreground underline">Approve runs for your watch</Link>
        </StatusBanner>
      )}

      <section aria-label="Race countdown" className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Paris Marathon · Sunday 4 April 2027</p>
        {toRace > 0 ? (
          <BigStat label="Days to go" value={toRace} unit={toRace === 1 ? "day" : "days"} />
        ) : toRace === 0 ? (
          <p className="text-4xl font-bold">Race day</p>
        ) : (
          <p className="text-4xl font-bold">Race done</p>
        )}
        <p className="text-sm">
          <span className="text-muted-foreground">Goals </span>
          A {formatGoalTime(targets.a)} · B {formatGoalTime(targets.b)} · C {formatGoalTime(targets.c)}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardDescription>Week {week.week} · {week.phase}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BigStat label="This week" value={Number(thisWeek.actualKm.toFixed(1))} unit={`of ${Number(thisWeek.plannedKm.toFixed(1))} km`} />
          <ProgressBar value={thisWeek.actualKm} max={thisWeek.plannedKm} label="Kilometres done this week" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Today</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!todayPlan ? (
            <p className="text-muted-foreground text-sm">Nothing planned for today.</p>
          ) : locked ? (
            <p className="text-muted-foreground text-sm">Locked until the ankle check is passed.</p>
          ) : (
            <>
              {isRestDay(todayPlan.run?.type) ? (
                <p className="text-lg font-medium">Rest from running</p>
              ) : (
                <>
                  <p className="text-lg font-medium">
                    {runLabel(todayPlan.run!.type)} · {formatKm(todayPlan.run!.distance_km)}
                  </p>
                  {todayPlan.run!.pace_or_effort && (
                    <p className="text-muted-foreground text-sm">{todayPlan.run!.pace_or_effort}</p>
                  )}
                </>
              )}
              {todayActual && (
                <p className="text-sm">Done: {formatKm(todayActual.distanceKm)}</p>
              )}
              {todayPlan.gym?.session && todayPlan.gym.session !== "unverified" && (
                <p className="text-sm">Gym: {todayPlan.gym.session}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Watch aria-hidden className="size-4" /> From your watch</CardTitle>
          <CardDescription>
            Training load, HRV, stress, recovery, calories and race predictions will show here once the daily COROS data is connected. Not connected yet.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly distance</CardTitle>
          <CardDescription>Planned and done, all 23 weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyChart data={series} />
        </CardContent>
      </Card>
    </>
  );
}
