import type { Distance, InsightsRange } from "./insights-range";
import type { Slot } from "./insights-series";
import { localDate } from "./runs";
import type { HealthDay, RunRow } from "./types";
import { addDays, dayMonth, mondayOf } from "./weeks";

export const paceOf = (run: Pick<RunRow, "distance_km" | "duration_s">) => run.duration_s / run.distance_km;

/** 237 becomes "3:57". */
export function formatPace(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 11191 becomes "3:06:31". */
export function formatHms(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "3:15:00" becomes 11700 seconds. */
export function goalSeconds(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export type Goal = { name: "A" | "B" | "C"; label: string; seconds: number };

export function goalsFromTargets(t: { a: string; b: string; c: string }): Goal[] {
  const mk = (name: Goal["name"], hms: string): Goal => ({ name, label: hms.replace(/:00$/, ""), seconds: goalSeconds(hms) });
  return [mk("A", t.a), mk("B", t.b), mk("C", t.c)];
}

/** How far the prediction is from each goal. Negative means the prediction is faster than the goal. */
export function gapsToGoals(predictionS: number, goals: Goal[]): { name: Goal["name"]; label: string; gapS: number }[] {
  return goals.map((g) => ({ name: g.name, label: g.label, gapS: Math.round(predictionS - g.seconds) }));
}

export function describeGap(gapS: number): string {
  if (gapS === 0) return "on the goal";
  const m = Math.floor(Math.abs(gapS) / 60);
  const s = Math.abs(gapS) % 60;
  return `${m}:${String(s).padStart(2, "0")} ${gapS < 0 ? "faster than" : "slower than"} the goal`;
}

// ---- 10. Long run progression ----
export type LongRunPoint = {
  weekStart: string; label: string; km: number | null; durationS: number | null; paceS: number | null; avgHr: number | null; runsThatWeek: number;
};

/** The longest run of each Monday to Sunday week that touches the range. A week with no run has no column. */
export function longRunPerWeek(runs: RunRow[], range: Pick<InsightsRange, "from" | "to">): LongRunPoint[] {
  const best = new Map<string, { run: RunRow; count: number }>();
  for (const r of runs) {
    const week = mondayOf(localDate(r.started_at));
    const cur = best.get(week);
    best.set(week, { run: !cur || r.distance_km > cur.run.distance_km ? r : cur.run, count: (cur?.count ?? 0) + 1 });
  }
  const out: LongRunPoint[] = [];
  for (let w = mondayOf(range.from); w <= mondayOf(range.to); w = addDays(w, 7)) {
    const b = best.get(w);
    out.push({
      weekStart: w, label: dayMonth(w), runsThatWeek: b?.count ?? 0,
      km: b ? Math.round(b.run.distance_km * 10) / 10 : null,
      durationS: b ? b.run.duration_s : null,
      paceS: b ? Math.round(paceOf(b.run)) : null,
      avgHr: b ? b.run.avg_hr : null,
    });
  }
  return out;
}

// ---- 11 to 13. VO2max, threshold pace, marathon prediction ----
export type FitnessPoint = {
  key: string; label: string; vo2max: number | null; thresholdS: number | null; marathonS: number | null; isolated: boolean;
};

function lastOf(rows: Map<string, HealthDay>, slot: Slot, pick: (r: HealthDay) => number | null): number | null {
  for (const d of [...slot.days].reverse()) {
    const v = rows.get(d) ? pick(rows.get(d)!) : null;
    if (v !== null) return v;
  }
  return null;
}

/** COROS only gives today's fitness numbers, so each day we have is one saved value. Weekly takes the newest in the week. */
export function fitnessSeries(rows: HealthDay[], slots: Slot[]): FitnessPoint[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const pts = slots.map((s) => ({
    key: s.key, label: s.label,
    vo2max: lastOf(map, s, (r) => r.vo2max), thresholdS: lastOf(map, s, (r) => r.threshold_pace_s), marathonS: lastOf(map, s, (r) => r.pred_marathon_s),
    isolated: false,
  }));
  return pts.map((p, i) => {
    const alone = (v: (x: FitnessPoint) => number | null) => v(p) !== null && (i === 0 || v(pts[i - 1]) === null) && (i === pts.length - 1 || v(pts[i + 1]) === null);
    return { ...p, isolated: alone((x) => x.vo2max) || alone((x) => x.thresholdS) || alone((x) => x.marathonS) };
  });
}

// ---- 14. Running efficiency ----
/** Run types the plan calls easy. Strides and quality sessions are not comparable. */
export const EASY_TYPES = new Set(["easy", "recovery"]);
export type MonthGroup = "this" | "last" | "before" | "earlier";
export type EfficiencyPoint = { id: string; date: string; label: string; km: number; hr: number; paceS: number; group: MonthGroup };

const monthKey = (d: string) => d.slice(0, 7);
function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function monthGroup(date: string, today: string): MonthGroup {
  const m = monthKey(date);
  if (m === monthKey(today)) return "this";
  if (m === shiftMonth(monthKey(today), -1)) return "last";
  if (m === shiftMonth(monthKey(today), -2)) return "before";
  return "earlier";
}

const BANDS: Record<Distance, [number, number]> = { all: [0, Infinity], "5-10": [5, 10], "10-16": [10, 16] };

/** Easy runs with a heart rate, inside the range and the distance band. Pace is whole run time over distance. */
export function efficiencyPoints(
  runs: RunRow[], planTypes: Record<string, string>, range: Pick<InsightsRange, "from" | "to" | "dist">, today: string,
): EfficiencyPoint[] {
  const [lo, hi] = BANDS[range.dist];
  return runs
    .map((r) => ({ r, date: localDate(r.started_at) }))
    .filter(({ r, date }) =>
      r.avg_hr !== null && date >= range.from && date <= range.to && EASY_TYPES.has(planTypes[date] ?? "") &&
      r.distance_km >= lo && r.distance_km <= hi)
    .map(({ r, date }) => ({
      id: r.coros_id, date, label: dayMonth(date), km: Math.round(r.distance_km * 10) / 10, hr: r.avg_hr as number,
      paceS: Math.round(paceOf(r)), group: monthGroup(date, today),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
