import type { HealthDay, RecoverySnapshot } from "./types";
import { addDays, dayMonth, HOME_TIME_ZONE, todayLocal } from "./weeks";

export type Kpi = {
  id: "sleep" | "hrv" | "resting-hr" | "recovery" | "training-load" | "fitness";
  label: string;
  value: string | null; // null means no data, which is never shown as zero
  unit: string;
  lines: string[];
  measured: string | null; // when the number was measured, because the metrics update at different times
  stale: boolean; // measured more than two days ago
};

export const BASELINE_DAYS = 28;
const MIN_BASELINE_VALUES = 5; // fewer than this is not a baseline yet
const STALE_AFTER_DAYS = 2;

type Pick = (row: HealthDay) => number | null;

/** The newest row that has a real value for this metric. Rows may arrive in any order. */
export function latestWith(rows: HealthDay[], pick: Pick): { row: HealthDay; value: number } | null {
  let best: { row: HealthDay; value: number } | null = null;
  for (const row of rows) {
    const value = pick(row);
    if (value !== null && (!best || row.day > best.row.day)) best = { row, value };
  }
  return best;
}

/** Average of the 28 days before `day` (the day itself is left out), ignoring empty days. Null with fewer than 5 values. */
export function baselineBefore(rows: HealthDay[], pick: Pick, day: string): number | null {
  const start = addDays(day, -BASELINE_DAYS);
  const values = rows
    .filter((r) => r.day >= start && r.day < day)
    .map(pick)
    .filter((v): v is number => v !== null);
  if (values.length < MIN_BASELINE_VALUES) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** "6 above your 28 day average", or null when there is no baseline to compare with. */
export function compareToBaseline(value: number, baseline: number | null): string | null {
  if (baseline === null) return null;
  const diff = Math.round(value - baseline);
  if (diff === 0) return "In line with your 28 day average";
  return `${Math.abs(diff)} ${diff > 0 ? "above" : "below"} your 28 day average`;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function formatPaceSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /km`;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: HOME_TIME_ZONE }).format(new Date(iso));
}

const isStale = (day: string, today: string) => day < addDays(today, -STALE_AFTER_DAYS);
const empty = (id: Kpi["id"], label: string, unit = ""): Kpi => ({ id, label, value: null, unit, lines: ["No data yet"], measured: null, stale: false });

/** The six cards at the top of Insights. `rows` should cover at least the last 60 days. */
export function buildKpis(rows: HealthDay[], snapshot: RecoverySnapshot | null, today: string): Kpi[] {
  const cards: Kpi[] = [];

  const sleep = latestWith(rows, (r) => r.sleep_asleep_min);
  if (!sleep) cards.push(empty("sleep", "Sleep"));
  else {
    const score = sleep.row.sleep_score;
    const against = score === null ? null : compareToBaseline(score, baselineBefore(rows, (r) => r.sleep_score, sleep.row.day));
    cards.push({
      id: "sleep", label: "Sleep", value: formatMinutes(sleep.value), unit: "asleep",
      lines: [score === null ? "No score for this night" : `Score ${score}`, ...(against ? [against] : [])],
      measured: `Night ending ${dayMonth(sleep.row.day)}`, stale: isStale(sleep.row.day, today),
    });
  }

  const hrv = latestWith(rows, (r) => r.hrv_avg_ms);
  if (!hrv) cards.push(empty("hrv", "HRV"));
  else {
    const { hrv_label: label, hrv_normal_low_ms: low, hrv_normal_high_ms: high } = hrv.row;
    cards.push({
      id: "hrv", label: "HRV", value: String(hrv.value), unit: "ms",
      lines: [[label, low !== null && high !== null ? `normal ${low} to ${high} ms` : null].filter(Boolean).join(" · ")].filter(Boolean),
      measured: `Night ending ${dayMonth(hrv.row.day)}`, stale: isStale(hrv.row.day, today),
    });
  }

  const rhr = latestWith(rows, (r) => r.resting_hr);
  if (!rhr) cards.push(empty("resting-hr", "Resting HR"));
  else {
    const against = compareToBaseline(rhr.value, baselineBefore(rows, (r) => r.resting_hr, rhr.row.day));
    cards.push({
      id: "resting-hr", label: "Resting HR", value: String(rhr.value), unit: "bpm",
      lines: against ? [against] : [], measured: dayMonth(rhr.row.day), stale: isStale(rhr.row.day, today),
    });
  }

  if (!snapshot) cards.push(empty("recovery", "Recovery"));
  else {
    const day = todayLocalOf(snapshot.taken_at);
    const when = day === today ? `Updated ${clock(snapshot.taken_at)}` : `Updated ${dayMonth(day)} ${clock(snapshot.taken_at)}`;
    cards.push({
      id: "recovery", label: "Recovery", value: String(snapshot.recovery_pct), unit: "%",
      lines: [[snapshot.level, snapshot.full_recovery_h !== null ? `full in about ${snapshot.full_recovery_h} h` : null].filter(Boolean).join(" · ")].filter(Boolean),
      measured: when, stale: isStale(day, today),
    });
  }

  const load = latestWith(rows, (r) => r.load_ratio);
  if (!load) cards.push(empty("training-load", "Training load"));
  else {
    const { load_short: s, load_long: l, load_label: label } = load.row;
    cards.push({
      id: "training-load", label: "Training load", value: load.value.toFixed(2), unit: "ratio",
      lines: [s !== null && l !== null ? `Short-term ${s} · long-term ${l}` : null, label].filter((x): x is string => !!x),
      measured: dayMonth(load.row.day), stale: isStale(load.row.day, today),
    });
  }

  const fit = latestWith(rows, (r) => r.vo2max);
  if (!fit) cards.push(empty("fitness", "Fitness"));
  else {
    const pace = fit.row.threshold_pace_s;
    cards.push({
      id: "fitness", label: "Fitness", value: String(fit.value), unit: "VO2max",
      lines: pace !== null ? [`Threshold pace ${formatPaceSeconds(pace)}`] : [],
      measured: dayMonth(fit.row.day), stale: isStale(fit.row.day, today),
    });
  }

  return cards;
}

const todayLocalOf = (iso: string) => todayLocal(new Date(iso));
