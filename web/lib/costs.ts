// Pure helpers for the Costs page. No network, no database. They turn the receipts in llm_calls into days, weeks and months.
// A receipt holds the model, token counts, cost and a short error code. Never a message, an answer or a key.
import { addDays, dayMonth, mondayOf, todayLocal } from "./weeks";

export type CallRow = {
  at: string; // ISO time
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string; // numeric(10,6) can arrive as text
  ok: boolean;
  error: string | null;
};

export type CostView = "day" | "week" | "month";
export const VIEWS: { value: CostView; label: string; span: string }[] = [
  { value: "day", label: "Day", span: "the last 30 days" },
  { value: "week", label: "Week", span: "the last 12 weeks" },
  { value: "month", label: "Month", span: "the last 6 months" },
];
export const LOOKBACK_MONTHS = 6; // the loader reads this much history

/** ?view= from the address. Anything else is the daily view. */
export function parseCostView(value: string | string[] | undefined): CostView {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "week" || v === "month" ? v : "day";
}

// ---- what the money was spent on ----
export type Group = "chat" | "search" | "indexing" | "other";
export const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: "chat", label: "Chat", color: "var(--m-cost-chat)" },
  { key: "search", label: "Library search", color: "var(--m-cost-search)" },
  { key: "indexing", label: "Library indexing", color: "var(--m-cost-indexing)" },
  { key: "other", label: "Demos and tests", color: "var(--m-cost-other)" },
];

export function groupPurpose(purpose: string): Group {
  if (purpose === "chat") return "chat";
  if (purpose === "embed_search") return "search";
  if (purpose === "embed_library") return "indexing";
  return "other";
}

// ---- money ----
/** Receipts hold six decimals. Adding them as whole millionths of a dollar avoids 0.1 + 0.2 style drift. */
const micro = (row: { cost_usd: number | string }) => Math.round(Number(row.cost_usd) * 1e6) || 0;
const sumMicro = (rows: CallRow[]) => rows.reduce((total, r) => total + micro(r), 0);
const dollars = (m: number) => m / 1e6;

/** $0.043 under a dollar, $12.40 above. Small amounts need the third decimal to show anything. */
export function formatUsd(value: number): string {
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(3)}`;
}

// ---- days, weeks, months in Paris ----
export const parisDay = (iso: string): string => todayLocal(new Date(iso));
const monthOf = (day: string) => day.slice(0, 7);
const monthStart = (day: string) => `${monthOf(day)}-01`;

function addMonths(monthStartDay: string, n: number): string {
  const d = new Date(`${monthStartDay}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}

function monthLabel(key: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}

export type Bucket = {
  key: string; // first day of the day, week (a Monday) or month
  label: string;
  total: number;
  calls: number;
  byGroup: Record<Group, number>;
};

const emptyGroups = (): Record<Group, number> => ({ chat: 0, search: 0, indexing: 0, other: 0 });

/** The keys of every bucket in the window, oldest first, so a day with no spending still shows as zero. */
export function bucketKeys(view: CostView, today: string): string[] {
  if (view === "day") return Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  if (view === "week") return Array.from({ length: 12 }, (_, i) => addDays(mondayOf(today), (i - 11) * 7));
  return Array.from({ length: LOOKBACK_MONTHS }, (_, i) => addMonths(monthStart(today), i - (LOOKBACK_MONTHS - 1)));
}

function keyFor(view: CostView, day: string): string {
  return view === "day" ? day : view === "week" ? mondayOf(day) : monthStart(day);
}

function labelFor(view: CostView, key: string): string {
  return view === "month" ? monthLabel(key) : dayMonth(key);
}

export function bucketCosts(rows: CallRow[], view: CostView, today: string): Bucket[] {
  const keys = bucketKeys(view, today);
  const sums = new Map(keys.map((k) => [k, { total: 0, calls: 0, byGroup: emptyGroups() }]));
  for (const row of rows) {
    const slot = sums.get(keyFor(view, parisDay(row.at)));
    if (!slot) continue; // older than the window
    const m = micro(row);
    slot.total += m;
    slot.calls += 1;
    slot.byGroup[groupPurpose(row.purpose)] += m;
  }
  return keys.map((key) => {
    const s = sums.get(key)!;
    return {
      key,
      label: labelFor(view, key),
      total: dollars(s.total),
      calls: s.calls,
      byGroup: Object.fromEntries(GROUPS.map((g) => [g.key, dollars(s.byGroup[g.key])])) as Record<Group, number>,
    };
  });
}

// ---- the three headline numbers ----
export type Totals = { today: number; week: number; month: number };

export function totals(rows: CallRow[], today: string): Totals {
  const weekStart = mondayOf(today);
  const month = monthOf(today);
  let t = 0, w = 0, m = 0;
  for (const row of rows) {
    const day = parisDay(row.at);
    const cost = micro(row);
    if (day === today) t += cost;
    if (day >= weekStart && day <= today) w += cost;
    if (monthOf(day) === month && day <= today) m += cost;
  }
  return { today: dollars(t), week: dollars(w), month: dollars(m) };
}

/** Where the month might end. A range, because nobody knows the rest of the month: from "nothing more" to "the pace so far". */
export function monthForecast(spent: number, today: string): { low: number; high: number } {
  const dayOfMonth = Number(today.slice(8, 10));
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { low: spent, high: Math.max(spent, (spent / dayOfMonth) * daysInMonth) };
}

// ---- tables ----
export type Breakdown = { name: string; calls: number; inputTokens: number; outputTokens: number; cost: number };

/** The rows of this month, in Paris time. */
export function thisMonth(rows: CallRow[], today: string): CallRow[] {
  return rows.filter((r) => monthOf(parisDay(r.at)) === monthOf(today));
}

export function breakdown(rows: CallRow[], by: "model" | "purpose"): Breakdown[] {
  const map = new Map<string, { calls: number; i: number; o: number; m: number }>();
  for (const row of rows) {
    const name = row[by];
    const s = map.get(name) ?? { calls: 0, i: 0, o: 0, m: 0 };
    s.calls += 1;
    s.i += Number(row.input_tokens) || 0;
    s.o += Number(row.output_tokens) || 0;
    s.m += micro(row);
    map.set(name, s);
  }
  return [...map.entries()]
    .map(([name, s]) => ({ name, calls: s.calls, inputTokens: s.i, outputTokens: s.o, cost: dollars(s.m) }))
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
}

/** Average cost of one chat model call this month, or null when there were none. One chat turn can make several. */
export function averageChatCall(rows: CallRow[]): number | null {
  const chat = rows.filter((r) => r.purpose === "chat" && r.ok);
  return chat.length ? dollars(sumMicro(chat)) / chat.length : null;
}

// ---- calls that did not go through ----
const FAILURE_WORDS: Record<string, string> = {
  cap_reached: "Stopped because the monthly cap was already reached",
  cap_would_be_passed: "Stopped before the call, because it could have passed the cap",
  too_many_calls: "Stopped because the coach made too many model calls in one turn",
};

export type Failure = { code: string; text: string; count: number };

/** Failed calls grouped by their short code, in our own words. A code that is not plain letters is shown as "unknown". */
export function failures(rows: CallRow[]): Failure[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.ok) continue;
    const code = row.error && /^[A-Za-z0-9_.-]{1,80}$/.test(row.error) ? row.error : "unknown";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count, text: FAILURE_WORDS[code] ?? `The model service reported an error (${code})` }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

// ---- the chart's table ----
export function chartTable(buckets: Bucket[], view: CostView): { columns: string[]; rows: (string | number | null)[][] } {
  return {
    columns: [view === "month" ? "Month" : view === "week" ? "Week starting" : "Day", ...GROUPS.map((g) => g.label), "Total", "Calls"],
    rows: buckets.map((b) => [b.label, ...GROUPS.map((g) => formatUsd(b.byGroup[g.key])), formatUsd(b.total), b.calls]),
  };
}

/** The first day to read from the database: the start of the oldest month in the longest view, in Paris time as a day. */
export function lookbackStartDay(today: string): string {
  return addMonths(monthStart(today), -(LOOKBACK_MONTHS - 1));
}
