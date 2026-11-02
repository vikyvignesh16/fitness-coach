import type { DayActual, PlanDay, PlanWeek, RunRow, WeekPoint } from "./types";

const NO_RUN_TYPES = new Set(["no_run", "not_recorded"]);

/** The calendar day in London for a UTC timestamp. The plan is written in London days. */
export function londonDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTimestamp));
}

export function plannedKm(day: PlanDay): number {
  const run = day.run;
  if (!run || NO_RUN_TYPES.has(run.type)) return 0;
  return run.distance_km ?? 0;
}

/** Group watch runs by London day. Several runs on one day add up. */
export function matchRunsToDays(runs: RunRow[]): Record<string, DayActual> {
  const out: Record<string, DayActual> = {};
  const hrWeight: Record<string, { sum: number; seconds: number }> = {};
  for (const r of runs) {
    const d = londonDate(r.started_at);
    const day = (out[d] ??= { distanceKm: 0, durationS: 0, avgHr: null, runs: 0 });
    day.distanceKm = Math.round((day.distanceKm + r.distance_km) * 1000) / 1000;
    day.durationS += r.duration_s;
    day.runs += 1;
    if (r.avg_hr != null) {
      const w = (hrWeight[d] ??= { sum: 0, seconds: 0 });
      w.sum += r.avg_hr * r.duration_s;
      w.seconds += r.duration_s;
    }
  }
  for (const [d, w] of Object.entries(hrWeight)) {
    out[d].avgHr = Math.round(w.sum / w.seconds);
  }
  return out;
}

/** Planned and actual km for each week, for the chart. Planned is the sum of the daily runs. */
export function weeklySeries(weeks: PlanWeek[], days: PlanDay[], runs: RunRow[]): WeekPoint[] {
  const actual = matchRunsToDays(runs);
  return [...weeks]
    .sort((a, b) => a.week - b.week)
    .map((w) => {
      const inWeek = days.filter((d) => d.week === w.week);
      const planned = inWeek.reduce((sum, d) => sum + plannedKm(d), 0);
      const done = inWeek.reduce((sum, d) => sum + (actual[d.date]?.distanceKm ?? 0), 0);
      return {
        week: w.week,
        startDate: w.start_date,
        phase: w.phase,
        plannedKm: Math.round(planned * 100) / 100,
        actualKm: Math.round(done * 100) / 100,
      };
    });
}
