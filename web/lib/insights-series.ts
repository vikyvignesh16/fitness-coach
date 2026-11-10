import { baselineBefore, BASELINE_DAYS } from "./insights-kpis";
import type { InsightsRange, LoadKind, View } from "./insights-range";
import { localDate } from "./runs";
import type { HealthDay, RecoverySnapshot, RunRow, StrengthSession } from "./types";
import { addDays, dayMonth, HOME_TIME_ZONE, mondayOf } from "./weeks";

/** A night 1.5 standard deviations under your own recent average is marked as unusually low. Display only, not advice. */
export const LOW_SCORE_SD = 1.5;
const MIN_PRIOR_NIGHTS = 5;

export type Slot = { key: string; label: string; days: string[] };

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Daily: one slot per day. Weekly: one slot per Monday to Sunday week, holding only the days inside the range. */
export function buildSlots(range: Pick<InsightsRange, "from" | "to">, view: View): Slot[] {
  const days = daysBetween(range.from, range.to);
  if (view === "daily") return days.map((d) => ({ key: d, label: dayMonth(d), days: [d] }));
  const weeks = new Map<string, string[]>();
  for (const d of days) {
    const monday = mondayOf(d);
    weeks.set(monday, [...(weeks.get(monday) ?? []), d]);
  }
  return [...weeks].map(([monday, d]) => ({ key: monday, label: dayMonth(monday), days: d }));
}

const present = (values: (number | null)[]) => values.filter((v): v is number => v !== null);

export function mean(values: (number | null)[]): number | null {
  const v = present(values);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function stdDev(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

const round = (v: number | null, places = 1) => (v === null ? null : Math.round(v * 10 ** places) / 10 ** places);

type Get = (r: HealthDay) => number | null;
const byDay = (rows: HealthDay[]) => new Map(rows.map((r) => [r.day, r]));

/** Mean of the slot's days that have a value. A day with no data is skipped, never counted as zero. */
function slotMean(rows: Map<string, HealthDay>, slot: Slot, pick: Get): number | null {
  return mean(slot.days.map((d) => (rows.get(d) ? pick(rows.get(d)!) : null)));
}

/** The newest real value in the slot (for running totals like training load). */
function slotLast(rows: Map<string, HealthDay>, slot: Slot, pick: Get): number | null {
  for (const d of [...slot.days].reverse()) {
    const v = rows.get(d) ? pick(rows.get(d)!) : null;
    if (v !== null) return v;
  }
  return null;
}

/** Trailing average over `window` days ending on `day`, needing at least `min` real values. */
export function trailingMean(rows: HealthDay[], pick: Get, day: string, window: number, min: number): number | null {
  const start = addDays(day, -(window - 1));
  const v = present(rows.filter((r) => r.day >= start && r.day <= day).map(pick));
  return v.length >= min ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function unusuallyLow(rows: HealthDay[], pick: Get, day: string, value: number): boolean {
  const start = addDays(day, -BASELINE_DAYS);
  const prior = present(rows.filter((r) => r.day >= start && r.day < day).map(pick));
  if (prior.length < MIN_PRIOR_NIGHTS) return false;
  const sd = stdDev(prior);
  return sd > 0 && value < prior.reduce((a, b) => a + b, 0) / prior.length - LOW_SCORE_SD * sd;
}

// ---- 1. Sleep composition ----
export type SleepPoint = {
  key: string; label: string;
  deep: number | null; rem: number | null; light: number | null; awake: number | null; // hours
  asleepMin: number | null; periodMin: number | null; napMin: number | null;
};

export function sleepComposition(rows: HealthDay[], slots: Slot[]): SleepPoint[] {
  const map = byDay(rows);
  const h = (slot: Slot, pick: Get) => { const m = slotMean(map, slot, pick); return m === null ? null : round(m / 60, 2); };
  return slots.map((s) => ({
    key: s.key, label: s.label,
    deep: h(s, (r) => r.sleep_deep_min), rem: h(s, (r) => r.sleep_rem_min),
    light: h(s, (r) => r.sleep_light_min), awake: h(s, (r) => r.sleep_awake_min),
    asleepMin: round(slotMean(map, s, (r) => r.sleep_asleep_min), 0),
    periodMin: round(slotMean(map, s, (r) => r.sleep_period_min), 0),
    napMin: round(slotMean(map, s, (r) => r.sleep_nap_min), 0),
  }));
}

// ---- 2. Sleep score ----
export type ScorePoint = { key: string; label: string; score: number | null; baseline: number | null; low: boolean; isolated: boolean };

export function sleepScore(rows: HealthDay[], slots: Slot[], view: View): ScorePoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => {
    const score = round(slotMean(map, s, (r) => r.sleep_score), view === "daily" ? 0 : 1);
    const last = s.days[s.days.length - 1];
    return {
      key: s.key, label: s.label, score,
      baseline: round(baselineBefore(rows, (r) => r.sleep_score, last)),
      low: view === "daily" && score !== null && unusuallyLow(rows, (r) => r.sleep_score, s.days[0], score),
      isolated: false,
    };
  });
  return markIsolated(points, (p) => p.score);
}

// ---- 3. HRV ----
export type HrvPoint = {
  key: string; label: string; hrv: number | null; avg7: number | null;
  bandLow: number | null; bandHigh: number | null; band: [number, number] | null;
  status: string | null; baseline: number | null; isolated: boolean;
};

export function hrvSeries(rows: HealthDay[], slots: Slot[], view: View): HrvPoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => {
    const hrv = round(slotMean(map, s, (r) => r.hrv_avg_ms), view === "daily" ? 0 : 1);
    const low = round(slotMean(map, s, (r) => r.hrv_normal_low_ms), 0);
    const high = round(slotMean(map, s, (r) => r.hrv_normal_high_ms), 0);
    const day = s.days[s.days.length - 1];
    return {
      key: s.key, label: s.label, hrv,
      avg7: view === "daily" ? round(trailingMean(rows, (r) => r.hrv_avg_ms, day, 7, 3)) : null,
      bandLow: low, bandHigh: high, band: low !== null && high !== null ? ([low, high] as [number, number]) : null,
      status: view === "daily" ? map.get(day)?.hrv_label ?? null : null,
      baseline: round(slotMean(map, s, (r) => r.hrv_baseline_ms), 0),
      isolated: false,
    };
  });
  return markIsolated(points, (p) => p.hrv);
}

// ---- 4. Resting heart rate ----
export type RhrPoint = { key: string; label: string; rhr: number | null; baseline: number | null; isolated: boolean };

export function restingHrSeries(rows: HealthDay[], slots: Slot[], view: View): RhrPoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => ({
    key: s.key, label: s.label,
    rhr: round(slotMean(map, s, (r) => r.resting_hr), view === "daily" ? 0 : 1),
    baseline: round(baselineBefore(rows, (r) => r.resting_hr, s.days[s.days.length - 1])),
    isolated: false,
  }));
  return markIsolated(points, (p) => p.rhr);
}

// ---- 5. Stress ----
export type StressPoint = { key: string; label: string; stress: number | null; baseline: number | null; isolated: boolean };

export function stressSeries(rows: HealthDay[], slots: Slot[], view: View): StressPoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => ({
    key: s.key, label: s.label,
    stress: round(slotMean(map, s, (r) => r.stress_avg), view === "daily" ? 0 : 1),
    baseline: round(baselineBefore(rows, (r) => r.stress_avg, s.days[s.days.length - 1])),
    isolated: false,
  }));
  return markIsolated(points, (p) => p.stress);
}

// ---- 6. Recovery status ----
export type RecoveryPoint = { key: string; label: string; last: number | null; min: number | null; max: number | null; band: [number, number] | null; isolated: boolean };

/** One point per day: the last recovery value of the day, with the day's lowest and highest as a band. Weekly averages them. */
export function recoverySeries(rows: HealthDay[], slots: Slot[], view: View): RecoveryPoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => {
    const last = round(slotMean(map, s, (r) => r.recovery_last), view === "daily" ? 0 : 1);
    const min = round(slotMean(map, s, (r) => r.recovery_min), 0);
    const max = round(slotMean(map, s, (r) => r.recovery_max), 0);
    return { key: s.key, label: s.label, last, min, max, band: min !== null && max !== null ? ([min, max] as [number, number]) : null, isolated: false };
  });
  return markIsolated(points, (p) => p.last);
}

export type IntradayPoint = { at: string; label: string; pct: number; level: string | null };

/** The recovery snapshots taken on one Paris day, in time order, for the "today so far" line. */
export function intradayPoints(snapshots: RecoverySnapshot[], day: string): IntradayPoint[] {
  return snapshots
    .filter((s) => localDate(s.taken_at) === day)
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    .map((s) => ({
      at: s.taken_at, pct: s.recovery_pct, level: s.level,
      label: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: HOME_TIME_ZONE }).format(new Date(s.taken_at)),
    }));
}

// ---- 9. Short-term against long-term load (COROS's own numbers) ----
export type LoadPoint = { key: string; label: string; short: number | null; long: number | null; ratio: number | null; status: string | null; isolated: boolean };

export function loadSeries(rows: HealthDay[], slots: Slot[]): LoadPoint[] {
  const map = byDay(rows);
  const points = slots.map((s) => ({
    key: s.key, label: s.label,
    short: slotLast(map, s, (r) => r.load_short), long: slotLast(map, s, (r) => r.load_long),
    ratio: slotLast(map, s, (r) => r.load_ratio),
    status: [...s.days].reverse().map((d) => map.get(d)?.load_label ?? null).find((l) => l !== null) ?? null,
    isolated: false,
  }));
  return markIsolated(points, (p) => p.short);
}

/** A point with no neighbour on either side draws no line, so it needs a visible dot. */
function markIsolated<T extends { isolated: boolean }>(points: T[], value: (p: T) => number | null): T[] {
  return points.map((p, i) => {
    const before = i > 0 ? value(points[i - 1]) : null;
    const after = i < points.length - 1 ? value(points[i + 1]) : null;
    return { ...p, isolated: value(p) !== null && before === null && after === null };
  });
}

// ---- 7. Weekly running volume (from the runs table) ----
export type VolumePoint = {
  weekStart: string; label: string; km: number; runs: number;
  changePct: number | null; avg4: number | null; inProgress: boolean;
};

/** Whole Monday to Sunday weeks that touch the range. The 4 week average also uses the 3 weeks before. */
export function weeklyVolume(runs: RunRow[], range: Pick<InsightsRange, "from" | "to">, today: string): VolumePoint[] {
  const firstShown = mondayOf(range.from);
  const lastShown = mondayOf(range.to);
  const totals = new Map<string, { km: number; runs: number }>();
  for (const r of runs) {
    const week = mondayOf(localDate(r.started_at));
    const t = totals.get(week) ?? { km: 0, runs: 0 };
    totals.set(week, { km: t.km + r.distance_km, runs: t.runs + 1 });
  }
  const km = (week: string) => totals.get(week)?.km ?? 0;
  const out: VolumePoint[] = [];
  for (let w = firstShown; w <= lastShown; w = addDays(w, 7)) {
    const inProgress = mondayOf(today) === w;
    const previous = km(addDays(w, -7));
    const lastFour = [0, 7, 14, 21].map((n) => km(addDays(w, -n)));
    out.push({
      weekStart: w, label: dayMonth(w),
      km: Math.round(km(w) * 10) / 10, runs: totals.get(w)?.runs ?? 0,
      changePct: !inProgress && previous > 0 ? Math.round(((km(w) - previous) / previous) * 100) : null,
      avg4: inProgress ? null : Math.round((lastFour.reduce((a, b) => a + b, 0) / 4) * 10) / 10,
      inProgress,
    });
  }
  return out;
}

// ---- 8. Training load, added up from your workouts ----
export type LoadSlot = {
  key: string; label: string;
  run: number; strength: number; // load added up for each kind, 0 when there was none of it
  total: number | null; // null when there were workouts but none had a load figure: that is missing, not zero
  workouts: number; unscored: number; // how many workouts, and how many of them have no load figure
};

/**
 * Training load for each day or week: the COROS load of every run and gym session added up.
 * No workouts means a real zero. Workouts that COROS gave no load for are counted as unscored, never as zero.
 */
export function loadPerSlot(runs: RunRow[], sessions: StrengthSession[], slots: Slot[], kind: LoadKind): LoadSlot[] {
  const byDate = new Map<string, { run: (number | null)[]; strength: (number | null)[] }>();
  const add = (day: string, which: "run" | "strength", load: number | null) => {
    const e = byDate.get(day) ?? { run: [], strength: [] };
    e[which].push(load);
    byDate.set(day, e);
  };
  if (kind !== "strength") for (const r of runs) add(localDate(r.started_at), "run", r.training_load ?? null);
  if (kind !== "run") for (const s of sessions) add(s.day, "strength", s.training_load);
  return slots.map((slot) => {
    const runLoads = slot.days.flatMap((d) => byDate.get(d)?.run ?? []);
    const strengthLoads = slot.days.flatMap((d) => byDate.get(d)?.strength ?? []);
    const all = [...runLoads, ...strengthLoads];
    const scored = all.filter((v): v is number => v !== null);
    const sum = (list: (number | null)[]) => list.reduce<number>((a, b) => a + (b ?? 0), 0);
    return {
      key: slot.key, label: slot.label, run: sum(runLoads), strength: sum(strengthLoads),
      total: all.length > 0 && scored.length === 0 ? null : sum(all),
      workouts: all.length, unscored: all.length - scored.length,
    };
  });
}
