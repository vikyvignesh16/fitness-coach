import { londonDate } from "./runs";
import type { RunRow } from "./types";
import { mondayOf } from "./weeks";

export type Range = "week" | "month" | "all";

export const RANGES: { value: Range; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
];

/** Reads ?range= from the address. Anything unknown falls back to month. */
export function parseRange(value: string | string[] | undefined): Range {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "week" || v === "month" || v === "all" ? v : "month";
}

/** First London day included in the range, or null for all time. Weeks run Monday to Sunday. */
export function rangeStart(range: Range, today: string): string | null {
  if (range === "week") return mondayOf(today);
  if (range === "month") return `${today.slice(0, 7)}-01`;
  return null;
}

export function filterRuns(runs: RunRow[], range: Range, today: string): RunRow[] {
  const start = rangeStart(range, today);
  return runs
    .filter((r) => start === null || londonDate(r.started_at) >= start)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function summarise(runs: RunRow[]) {
  return {
    count: runs.length,
    km: Math.round(runs.reduce((s, r) => s + r.distance_km, 0) * 100) / 100,
    durationS: runs.reduce((s, r) => s + r.duration_s, 0),
  };
}

/** The watch text is kept with each run. Pull the calories out of it, if it has them. */
export function caloriesFrom(raw: unknown): number | null {
  const text = (raw as { text?: unknown } | null)?.text;
  if (typeof text !== "string") return null;
  const m = text.match(/Calories: (\d+) kcal/);
  return m ? Number(m[1]) : null;
}
