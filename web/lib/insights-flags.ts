import { baselineBefore } from "./insights-kpis";
import { trailingMean } from "./insights-series";
import type { HealthDay } from "./types";
import { addDays } from "./weeks";

/** The thresholds Vicky approved on 10 Nov 2026. Change one here and a test must change with it. */
export const FLAG_LIMITS = {
  hrvNights: 3, // HRV under COROS's normal range on this many of the last 7 nights
  rhrAbove: 5, rhrDays: 3, // resting HR this many bpm over the 28 day average, this many days in a row
  sleepMin: 360, sleepNights: 3, // under 6 hours asleep on this many of the last 7 nights
  loadRatio: 1.3, loadDays: 3, // training load ratio above this, this many days in a row
  stressAbove: 10, // 7 day average stress this many points over the 28 day average
  recoveryBelow: 50, recoveryDays: 2, // last recovery reading of the day under this, this many days in a row
  window: 7, minNights: 5, // a 7 night check needs at least this many nights with data
} as const;

export type FlagState = "flag" | "ok" | "nodata";
export type Flag = { id: string; title: string; state: FlagState; fact: string };

type Pick = (r: HealthDay) => number | null;

/** The last `n` days ending on `end`, newest last. */
const lastDays = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));

/** The newest day up to today with a value, but only if it is today or yesterday. Older than that is not "now". */
function anchor(rows: HealthDay[], pick: Pick, today: string): string | null {
  const recent = rows.filter((r) => r.day <= today && r.day >= addDays(today, -1) && pick(r) !== null).map((r) => r.day).sort();
  return recent.length ? recent[recent.length - 1] : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Count nights in the last 7 that meet `test`. nodata when fewer than 5 of them have a value. */
function countNights(rows: HealthDay[], today: string, pick: (r: HealthDay) => boolean | null): { hits: number; known: number } {
  const days = new Map(rows.map((r) => [r.day, r]));
  let hits = 0, known = 0;
  for (const d of lastDays(today, FLAG_LIMITS.window)) {
    const row = days.get(d);
    const v = row ? pick(row) : null;
    if (v === null) continue;
    known++;
    if (v) hits++;
  }
  return { hits, known };
}

function run(rows: HealthDay[], today: string, pick: (r: HealthDay, day: string) => boolean | null, days: number): { hit: boolean; known: boolean; end: string | null } {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const withValue: Pick = (r) => (pick(r, r.day) === null ? null : 1);
  const end = anchor(rows, withValue, today);
  if (!end) return { hit: false, known: false, end: null };
  const flags = lastDays(end, days).map((d) => (byDay.get(d) ? pick(byDay.get(d)!, d) : null));
  if (flags.some((f) => f === null)) return { hit: false, known: false, end };
  return { hit: flags.every(Boolean), known: true, end };
}

export function buildFlags(rows: HealthDay[], today: string): Flag[] {
  const L = FLAG_LIMITS;
  const out: Flag[] = [];
  const nodata = (id: string, title: string, why: string): Flag => ({ id, title, state: "nodata", fact: why });

  // 1. HRV under COROS's normal range
  {
    const title = "HRV";
    const { hits, known } = countNights(rows, today, (r) => (r.hrv_avg_ms === null || r.hrv_normal_low_ms === null ? null : r.hrv_avg_ms < r.hrv_normal_low_ms));
    if (known < L.minNights) out.push(nodata("hrv", title, `Only ${plural(known, "night")} of the last 7 have HRV and a normal range, so this was not checked.`));
    else out.push({ id: "hrv", title, state: hits >= L.hrvNights ? "flag" : "ok", fact: `HRV was under your COROS normal range on ${hits} of the last ${known} nights.` });
  }

  // 2. Resting heart rate over the 28 day average
  {
    const title = "Resting heart rate";
    const r = run(rows, today, (row, d) => {
      if (row.resting_hr === null) return null;
      const base = baselineBefore(rows, (x) => x.resting_hr, d);
      return base === null ? null : row.resting_hr - base >= L.rhrAbove;
    }, L.rhrDays);
    if (!r.known) out.push(nodata("rhr", title, `Needs ${L.rhrDays} days in a row with a resting heart rate and a 28 day average, so this was not checked.`));
    else out.push({ id: "rhr", title, state: r.hit ? "flag" : "ok", fact: r.hit ? `Resting heart rate was ${L.rhrAbove} or more beats over your 28 day average for ${L.rhrDays} days in a row.` : `Resting heart rate has not been ${L.rhrAbove} or more beats over your 28 day average for ${L.rhrDays} days in a row.` });
  }

  // 3. Short nights
  {
    const title = "Sleep";
    const { hits, known } = countNights(rows, today, (r) => (r.sleep_asleep_min === null ? null : r.sleep_asleep_min < L.sleepMin));
    if (known < L.minNights) out.push(nodata("sleep", title, `Only ${plural(known, "night")} of the last 7 have sleep data, so this was not checked.`));
    else out.push({ id: "sleep", title, state: hits >= L.sleepNights ? "flag" : "ok", fact: `You slept under 6 hours on ${hits} of the last ${known} nights.` });
  }

  // 4. Training load ratio
  {
    const title = "Training load";
    const r = run(rows, today, (row) => (row.load_ratio === null ? null : row.load_ratio > L.loadRatio), L.loadDays);
    if (!r.known) out.push(nodata("load", title, `Needs ${L.loadDays} days in a row with a COROS load ratio, so this was not checked.`));
    else out.push({ id: "load", title, state: r.hit ? "flag" : "ok", fact: r.hit ? `Your short-term load was more than ${L.loadRatio} times your long-term load for ${L.loadDays} days in a row.` : `Your short-term load has not been more than ${L.loadRatio} times your long-term load for ${L.loadDays} days in a row.` });
  }

  // 5. Stress
  {
    const title = "Stress";
    const end = anchor(rows, (r) => r.stress_avg, today);
    const week = end ? trailingMean(rows, (r) => r.stress_avg, end, L.window, 4) : null;
    const base = end ? baselineBefore(rows, (r) => r.stress_avg, addDays(end, -(L.window - 1))) : null; // the 28 days before the week, so the week does not pull its own yardstick up
    if (week === null || base === null) out.push(nodata("stress", title, "Needs 4 days of stress in the last 7 and a 28 day average, so this was not checked."));
    else {
      const gap = Math.round(week - base);
      out.push({ id: "stress", title, state: week - base >= L.stressAbove ? "flag" : "ok", fact: `Your 7 day average stress is ${Math.abs(gap)} ${gap >= 0 ? "above" : "below"} your 28 day average.` });
    }
  }

  // 6. Recovery
  {
    const title = "Recovery";
    const r = run(rows, today, (row) => (row.recovery_last === null ? null : row.recovery_last < L.recoveryBelow), L.recoveryDays);
    if (!r.known) out.push(nodata("recovery", title, `Needs ${L.recoveryDays} days in a row with a recovery reading, so this was not checked. This history began on 9 Nov.`));
    else out.push({ id: "recovery", title, state: r.hit ? "flag" : "ok", fact: r.hit ? `The last recovery reading of the day was under ${L.recoveryBelow}% on ${L.recoveryDays} days in a row.` : `The last recovery reading of the day has not been under ${L.recoveryBelow}% on ${L.recoveryDays} days in a row.` });
  }
  return out;
}
