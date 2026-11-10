import type { InsightsRange } from "./insights-range";
import { localDate } from "./runs";
import type { HealthDay, RunRow, StrengthSession } from "./types";
import { addDays, dayMonth } from "./weeks";
import type { RunForTable } from "./workout-table";

/** COROS's "how did it feel" words, easiest to hardest. A word not in this list is left out and counted. */
export const EFFORT_SCALE = ["Very Easy", "Easy", "Moderate", "Hard", "Very Hard"] as const;

export function effortRank(word: string | null): number | null {
  if (!word) return null;
  const i = EFFORT_SCALE.findIndex((w) => w.toLowerCase() === word.trim().toLowerCase());
  return i < 0 ? null : i + 1;
}

// ---- 16. Training load against the next morning's HRV ----
export type LoadHrvPoint = {
  day: string; label: string;
  load: number; // that day's COROS training load, 0 for a rest day the watch recorded
  rest: boolean;
  hrv: number; baseline: number;
  deviation: number; // next morning's HRV minus COROS's baseline for that date, in ms
};
export type LoadHrvResult = {
  points: LoadHrvPoint[];
  leftOut: { noWatchData: number; noNextHrv: number; unscored: number };
};

/**
 * One dot per day: that day's load, and how far the next morning's HRV sat from COROS's baseline.
 * A rest day counts as zero load only when the watch recorded that day (it has a health row).
 * Workouts with no load figure are left out, never counted as zero. So is a day with no next morning HRV.
 */
export function loadVsNextHrv(rows: HealthDay[], runs: RunRow[], sessions: StrengthSession[], range: Pick<InsightsRange, "from" | "to">): LoadHrvResult {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const loads = new Map<string, (number | null)[]>();
  const add = (day: string, load: number | null) => loads.set(day, [...(loads.get(day) ?? []), load]);
  for (const r of runs) add(localDate(r.started_at), r.training_load ?? null);
  for (const s of sessions) add(s.day, s.training_load);

  const points: LoadHrvPoint[] = [];
  const leftOut = { noWatchData: 0, noNextHrv: 0, unscored: 0 };
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const todays = loads.get(d) ?? [];
    if (todays.length === 0 && !byDay.has(d)) { leftOut.noWatchData++; continue; }
    const next = byDay.get(addDays(d, 1));
    if (!next || next.hrv_avg_ms === null || next.hrv_baseline_ms === null) { leftOut.noNextHrv++; continue; }
    const scored = todays.filter((v): v is number => v !== null);
    if (todays.length > 0 && scored.length === 0) { leftOut.unscored++; continue; }
    points.push({
      day: d, label: dayMonth(d), load: scored.reduce((a, b) => a + b, 0), rest: todays.length === 0,
      hrv: next.hrv_avg_ms, baseline: next.hrv_baseline_ms, deviation: Math.round((next.hrv_avg_ms - next.hrv_baseline_ms) * 10) / 10,
    });
  }
  return { points, leftOut };
}

// ---- 15. How the workout felt against the night's HRV before it ----
export type EffortHrvPoint = { key: string; day: string; label: string; title: string; effort: number; word: string; hrv: number };
export type EffortHrvResult = {
  points: EffortHrvPoint[];
  leftOut: { noEffort: number; unknownWord: number; noHrv: number };
};

/** One dot per workout: the effort word on the 1 to 5 scale, and the HRV of the night before it (that day's health row). */
export function effortVsHrv(rows: HealthDay[], runs: RunForTable[], sessions: StrengthSession[]): EffortHrvResult {
  const hrvOn = new Map(rows.map((r) => [r.day, r.hrv_avg_ms]));
  const items = [
    ...runs.map((r) => ({ key: `run-${r.coros_id}`, day: localDate(r.started_at), title: "Run", word: r.perceived_effort })),
    ...sessions.map((s) => ({ key: `strength-${s.id}`, day: s.day, title: "Strength", word: s.perceived_effort })),
  ];
  const points: EffortHrvPoint[] = [];
  const leftOut = { noEffort: 0, unknownWord: 0, noHrv: 0 };
  for (const it of items) {
    const word = it.word?.trim() || null;
    if (!word) { leftOut.noEffort++; continue; }
    const rank = effortRank(word);
    if (rank === null) { leftOut.unknownWord++; continue; }
    const hrv = hrvOn.get(it.day) ?? null;
    if (hrv === null) { leftOut.noHrv++; continue; }
    points.push({ key: it.key, day: it.day, label: dayMonth(it.day), title: it.title, effort: rank, word: EFFORT_SCALE[rank - 1], hrv });
  }
  return { points, leftOut };
}
