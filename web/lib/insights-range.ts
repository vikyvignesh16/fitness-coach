import { addDays } from "./weeks";

export type Preset = "7" | "30" | "90" | "custom";
export type View = "daily" | "weekly";

export type InsightsRange = {
  preset: Preset;
  from: string; // first day, yyyy-mm-dd
  to: string; // last day, yyyy-mm-dd
  days: number; // how many days from..to, both included
  view: View;
  notice: string | null; // set when what was asked for was not valid and we fell back
};

export const PRESETS: { value: "7" | "30" | "90"; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** A custom range can be at most this many days. The health tables hold about this much history. */
export const MAX_SPAN_DAYS = 180;

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

function isRealDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; // 30 Feb rolls over, so it fails
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Reads ?range= (7, 30, 90 or custom), ?from= and ?to= and ?view= (daily or weekly) from the address.
 * Anything not valid falls back to the last 7 days and says why in `notice`. The last day is never in the future.
 */
export function parseInsightsRange(
  params: { range?: Param; from?: Param; to?: Param; view?: Param },
  today: string,
): InsightsRange {
  const view: View = first(params.view) === "weekly" ? "weekly" : "daily";
  const range = first(params.range);

  const preset = (n: 7 | 30 | 90): InsightsRange => ({
    preset: String(n) as Preset, from: addDays(today, -(n - 1)), to: today, days: n, view, notice: null,
  });
  const fallback = (notice: string): InsightsRange => ({ ...preset(7), notice });

  if (range === "30") return preset(30);
  if (range === "90") return preset(90);
  if (range !== "custom") return preset(7);

  const from = first(params.from);
  const to = first(params.to);
  if (!isRealDate(from) || !isRealDate(to)) return fallback("Those dates were not valid, so this shows the last 7 days.");
  const end = to > today ? today : to;
  if (from > end) return fallback("The start date was after the end date, so this shows the last 7 days.");
  const days = daysBetween(from, end);
  if (days > MAX_SPAN_DAYS) return fallback(`A custom range can be at most ${MAX_SPAN_DAYS} days, so this shows the last 7 days.`);
  return { preset: "custom", from, to: end, days, view, notice: null };
}

/** Address for a link that keeps the current range and changes only what is passed in. */
export function insightsHref(range: InsightsRange, change: { preset?: Preset; view?: View }): string {
  const preset = change.preset ?? range.preset;
  const q = new URLSearchParams({ range: preset });
  if (preset === "custom") {
    q.set("from", range.from);
    q.set("to", range.to);
  }
  q.set("view", change.view ?? range.view);
  return `/insights?${q.toString()}`;
}
