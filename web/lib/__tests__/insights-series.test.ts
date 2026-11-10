import { describe, expect, it } from "vitest";
import {
  buildSlots, daysBetween, hrvSeries, loadSeries, restingHrSeries, sleepComposition, sleepScore, trailingMean, unusuallyLow, weeklyVolume,
} from "../insights-series";
import type { HealthDay, RunRow } from "../types";
import { addDays } from "../weeks";

function day(date: string, over: Partial<HealthDay> = {}): HealthDay {
  const keys = ["sleep_score", "sleep_asleep_min", "sleep_total_min", "sleep_period_min", "sleep_deep_min", "sleep_light_min", "sleep_rem_min",
    "sleep_awake_min", "sleep_nap_min", "hrv_avg_ms", "hrv_label", "hrv_normal_low_ms", "hrv_normal_high_ms", "hrv_baseline_ms",
    "resting_hr", "hr_avg", "stress_avg", "steps", "exercise_min", "load_short", "load_long", "load_ratio", "load_label",
    "recovery_avg", "recovery_min", "recovery_max", "recovery_last", "vo2max", "running_level", "threshold_pace_s",
    "pred_5k_s", "pred_10k_s", "pred_half_s", "pred_marathon_s"];
  return { ...Object.fromEntries(keys.map((k) => [k, null])), day: date, complete: true, ...over } as HealthDay;
}
const before = (end: string, n: number, over: Partial<HealthDay>) => Array.from({ length: n }, (_, i) => day(addDays(end, -(i + 1)), over));
const range = { from: "2026-11-03", to: "2026-11-09" }; // Tuesday to Monday

describe("slots", () => {
  it("lists every day of the range, both ends included", () => {
    expect(daysBetween("2026-11-03", "2026-11-05")).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(buildSlots(range, "daily")).toHaveLength(7);
  });

  it("groups weekly slots Monday to Sunday and keeps only the days inside the range", () => {
    const weeks = buildSlots(range, "weekly");
    expect(weeks.map((w) => [w.key, w.days.length])).toEqual([["2026-11-02", 6], ["2026-11-09", 1]]);
  });
});

describe("sleep composition", () => {
  const rows = [day("2026-11-04", { sleep_deep_min: 99, sleep_light_min: 251, sleep_rem_min: 138, sleep_awake_min: 29, sleep_asleep_min: 488, sleep_period_min: 517, sleep_nap_min: 0 })];
  const points = sleepComposition(rows, buildSlots(range, "daily"));

  it("turns minutes into hours for each stage", () => {
    const p = points.find((x) => x.key === "2026-11-04")!;
    expect([p.deep, p.rem, p.light, p.awake]).toEqual([1.65, 2.3, 4.18, 0.48]);
    expect([p.asleepMin, p.periodMin, p.napMin]).toEqual([488, 517, 0]);
  });

  it("leaves a night with no data empty, not zero", () => {
    const p = points.find((x) => x.key === "2026-11-05")!;
    expect([p.deep, p.rem, p.light, p.awake, p.asleepMin]).toEqual([null, null, null, null, null]);
  });

  it("weekly shows the average night and skips nights with no data", () => {
    const more = [...rows, day("2026-11-05", { sleep_deep_min: 51, sleep_light_min: 0, sleep_rem_min: 0, sleep_awake_min: 0 })];
    const week = sleepComposition(more, buildSlots(range, "weekly"))[0];
    expect(week.deep).toBe(1.25); // (99 + 51) / 2 / 60, the other four days had no data
  });
});

describe("sleep score", () => {
  it("draws the baseline from the 28 days before and leaves missing nights empty", () => {
    const rows = [...before("2026-11-03", 10, { sleep_score: 80 }), day("2026-11-04", { sleep_score: 84 })];
    const pts = sleepScore(rows, buildSlots(range, "daily"), "daily");
    expect(pts.find((p) => p.key === "2026-11-04")).toMatchObject({ score: 84, baseline: 80 });
    expect(pts.find((p) => p.key === "2026-11-05")).toMatchObject({ score: null });
  });

  it("marks a night 1.5 standard deviations under the recent average as unusually low", () => {
    const calm = [78, 82, 80, 79, 81, 80, 78, 82].map((s, i) => day(addDays("2026-10-20", i), { sleep_score: s }));
    expect(unusuallyLow(calm, (r) => r.sleep_score, "2026-11-01", 60)).toBe(true);
    expect(unusuallyLow(calm, (r) => r.sleep_score, "2026-11-01", 78)).toBe(false); // the line is 77.75: average 80 minus 1.5 x 1.5
  });

  it("does not mark anything with fewer than 5 earlier nights, or with no variation to measure", () => {
    const fourVaried = [70, 90, 70, 90].map((s, i) => day(addDays("2026-10-25", i), { sleep_score: s }));
    expect(unusuallyLow(fourVaried, (r) => r.sleep_score, "2026-11-01", 10)).toBe(false);
    const fiveVaried = [...fourVaried, day("2026-10-29", { sleep_score: 70 })];
    expect(unusuallyLow(fiveVaried, (r) => r.sleep_score, "2026-11-01", 10)).toBe(true);
    expect(unusuallyLow(before("2026-11-01", 8, { sleep_score: 80 }), (r) => r.sleep_score, "2026-11-01", 10)).toBe(false);
  });

  it("flags an isolated night so it can be drawn as a dot, since a lone point has no line", () => {
    const rows = [day("2026-11-05", { sleep_score: 70 })];
    const pts = sleepScore(rows, buildSlots(range, "daily"), "daily");
    expect(pts.find((p) => p.key === "2026-11-05")!.isolated).toBe(true);
    const two = sleepScore([...rows, day("2026-11-06", { sleep_score: 71 })], buildSlots(range, "daily"), "daily");
    expect(two.find((p) => p.key === "2026-11-05")!.isolated).toBe(false);
  });

  it("weekly never marks a low night", () => {
    const rows = [...before("2026-11-03", 10, { sleep_score: 80 }), day("2026-11-04", { sleep_score: 5 })];
    expect(sleepScore(rows, buildSlots(range, "weekly"), "weekly").every((p) => !p.low)).toBe(true);
  });
});

describe("HRV", () => {
  const rows = [
    ...[3, 4, 5, 6, 7, 8].map((d) => day(`2026-11-0${d}`, { hrv_avg_ms: 60 + d, hrv_normal_low_ms: 55, hrv_normal_high_ms: 69, hrv_baseline_ms: 62, hrv_label: "Normal" })),
  ];

  it("carries each day's own normal range band, label and baseline", () => {
    const p = hrvSeries(rows, buildSlots(range, "daily"), "daily").find((x) => x.key === "2026-11-08")!;
    expect(p).toMatchObject({ hrv: 68, band: [55, 69], status: "Normal", baseline: 62 });
  });

  it("the 7 day average needs at least 3 real values and skips empty days", () => {
    expect(trailingMean(rows, (r) => r.hrv_avg_ms, "2026-11-04", 7, 3)).toBeNull(); // only 2 nights so far
    expect(trailingMean(rows, (r) => r.hrv_avg_ms, "2026-11-06", 7, 3)).toBe(64.5); // 63, 64, 65, 66
  });

  it("a day with no HRV has no point and no band, but the 7 day average carries on", () => {
    const p = hrvSeries(rows, buildSlots(range, "daily"), "daily").find((x) => x.key === "2026-11-09")!;
    expect([p.hrv, p.band]).toEqual([null, null]);
    expect(p.avg7).toBe(65.5);
  });

  it("weekly drops the rolling line and the label", () => {
    const w = hrvSeries(rows, buildSlots(range, "weekly"), "weekly")[0];
    expect(w.avg7).toBeNull();
    expect(w.status).toBeNull();
    expect(w.hrv).toBe(65.5);
  });
});

describe("resting heart rate", () => {
  it("compares each day with the 28 days before it", () => {
    const rows = [...before("2026-11-03", 8, { resting_hr: 54 }), day("2026-11-05", { resting_hr: 59 })];
    expect(restingHrSeries(rows, buildSlots(range, "daily"), "daily").find((p) => p.key === "2026-11-05")).toMatchObject({ rhr: 59, baseline: 54 });
  });
});

describe("load", () => {
  it("uses COROS's own short and long term numbers and label", () => {
    const rows = [day("2026-11-08", { load_short: 72, load_long: 65, load_ratio: 1.1, load_label: "Optimized" })];
    expect(loadSeries(rows, buildSlots(range, "daily")).find((p) => p.key === "2026-11-08")).toMatchObject({ short: 72, long: 65, ratio: 1.1, status: "Optimized" });
  });

  it("weekly takes the newest value in the week, not an average", () => {
    const rows = [day("2026-11-04", { load_short: 30, load_long: 60 }), day("2026-11-07", { load_short: 43, load_long: 61 })];
    expect(loadSeries(rows, buildSlots(range, "weekly"))[0]).toMatchObject({ short: 43, long: 61 });
  });
});

describe("weekly volume", () => {
  const run = (date: string, km: number): RunRow => ({ coros_id: date + km, started_at: `${date}T07:00:00Z`, distance_km: km, duration_s: 3000, avg_hr: null });
  const runs = [run("2026-10-12", 20), run("2026-10-19", 30), run("2026-10-26", 40), run("2026-11-02", 50), run("2026-11-04", 10), run("2026-11-08", 20)];
  const weeks = weeklyVolume(runs, { from: "2026-10-26", to: "2026-11-09" }, "2026-11-15");

  it("adds up each Monday to Sunday week and counts the runs", () => {
    expect(weeks.map((w) => [w.weekStart, w.km, w.runs])).toEqual([["2026-10-26", 40, 1], ["2026-11-02", 80, 3], ["2026-11-09", 0, 0]]);
  });

  it("shows the change from the week before, as a percentage", () => {
    expect(weeks[1].changePct).toBe(100); // 40 to 80
    expect(weeks[0].changePct).toBe(33); // 30 to 40
  });

  it("the 4 week average uses the 3 weeks before the range too", () => {
    expect(weeks[0].avg4).toBe(22.5); // (20 + 30 + 40 + the week before 12 Oct, which is 0) / 4
    expect(weeks[1].avg4).toBe(42.5); // (20 + 30 + 40 + 80) / 4
  });

  it("a week with no runs is zero kilometres, because no run is a real fact here", () => {
    expect(weeks[2].km).toBe(0);
  });

  it("the week in progress has no change figure and no average, so a part week is not compared to full ones", () => {
    const now = weeklyVolume(runs, { from: "2026-11-02", to: "2026-11-09" }, "2026-11-10");
    expect(now[1]).toMatchObject({ inProgress: true, changePct: null, avg4: null });
    expect(now[0].inProgress).toBe(false);
  });

  it("puts a late evening run on the Paris day it happened", () => {
    const late = weeklyVolume([run("2026-11-08", 10)].map((r) => ({ ...r, started_at: "2026-11-08T23:30:00Z" })), { from: "2026-11-09", to: "2026-11-09" }, "2026-11-20");
    expect(late[0]).toMatchObject({ weekStart: "2026-11-09", km: 10 }); // 00:30 on Monday in Paris
  });
});

import { intradayPoints, loadPerSlot, recoverySeries, stressSeries } from "../insights-series";
import type { RecoverySnapshot, StrengthSession } from "../types";

describe("stress", () => {
  it("has the day's average and your own 28 day average, with gaps left as gaps", () => {
    const rows = [...before("2026-11-03", 8, { stress_avg: 40 }), day("2026-11-05", { stress_avg: 56 })];
    const pts = stressSeries(rows, buildSlots(range, "daily"), "daily");
    expect(pts.find((p) => p.key === "2026-11-05")).toMatchObject({ stress: 56, baseline: 40, isolated: true });
    expect(pts.find((p) => p.key === "2026-11-06")).toMatchObject({ stress: null });
  });

  it("weekly averages the days that have a value", () => {
    const rows = [day("2026-11-03", { stress_avg: 30 }), day("2026-11-05", { stress_avg: 50 })];
    expect(stressSeries(rows, buildSlots(range, "weekly"), "weekly")[0].stress).toBe(40);
  });
});

describe("recovery", () => {
  const rows = [day("2026-11-08", { recovery_last: 80, recovery_min: 60, recovery_max: 95 }), day("2026-11-09", { recovery_last: 96, recovery_min: 96, recovery_max: 96 })];

  it("one point a day: the last value, with the day's lowest and highest as a band", () => {
    const p = recoverySeries(rows, buildSlots(range, "daily"), "daily").find((x) => x.key === "2026-11-08")!;
    expect(p).toMatchObject({ last: 80, min: 60, max: 95, band: [60, 95] });
  });

  it("a day with no snapshots has no point and no band, not zero", () => {
    const p = recoverySeries(rows, buildSlots(range, "daily"), "daily").find((x) => x.key === "2026-11-05")!;
    expect([p.last, p.min, p.max, p.band]).toEqual([null, null, null, null]);
  });

  it("two days in a row need no dots", () => {
    const pts = recoverySeries(rows, buildSlots(range, "daily"), "daily");
    expect(pts.find((x) => x.key === "2026-11-08")!.isolated).toBe(false);
  });
});

describe("intraday recovery", () => {
  const snap = (taken_at: string, pct: number): RecoverySnapshot => ({ taken_at, recovery_pct: pct, level: "Fresh", full_recovery_h: 10 });

  it("keeps only that Paris day's snapshots, in time order, with the Paris clock time", () => {
    const pts = intradayPoints([
      snap("2026-11-10T09:00:00Z", 90), snap("2026-11-09T22:30:00Z", 70), snap("2026-11-09T23:30:00Z", 75),
      snap("2026-11-10T06:00:00Z", 85), snap("2026-11-10T23:30:00Z", 99),
    ], "2026-11-10");
    // 22:30 UTC on the 9th is 23:30 Paris on the 9th, and 23:30 UTC on the 10th is already the 11th in Paris.
    expect(pts.map((p) => [p.label, p.pct])).toEqual([["00:30", 75], ["07:00", 85], ["10:00", 90]]);
  });

  it("no snapshots that day means no points", () => {
    expect(intradayPoints([snap("2026-11-09T12:00:00Z", 50)], "2026-11-10")).toEqual([]);
  });
});

describe("training load per day", () => {
  const run = (date: string, load: number | null): RunRow => ({ coros_id: date + load, started_at: `${date}T07:00:00Z`, distance_km: 8, duration_s: 3000, avg_hr: null, training_load: load });
  const session = (dayStr: string, load: number | null): StrengthSession => ({
    id: dayStr + load, source: "coros", coros_id: dayStr + load, started_at: `${dayStr}T17:00:00Z`, day: dayStr, workout_name: null, duration_s: 3000, total_time_s: null, sets_count: null,
    avg_hr: null, calories: null, training_load: load, aerobic_te: null, anaerobic_te: null, training_focus: null, perceived_effort: null, workout_note: null, sets: [],
  });
  const slots = buildSlots({ from: "2026-11-02", to: "2026-11-04" }, "daily");

  it("adds a day's runs and gym sessions, keeping each kind separate", () => {
    const l = loadPerSlot([run("2026-11-02", 100), run("2026-11-02", 20)], [session("2026-11-02", 30)], slots, "all");
    expect(l[0]).toMatchObject({ run: 120, strength: 30, total: 150, workouts: 3, unscored: 0 });
  });

  it("a day with no workout is a real zero", () => {
    expect(loadPerSlot([], [], slots, "all")[1]).toMatchObject({ run: 0, strength: 0, total: 0, workouts: 0 });
  });

  it("workouts COROS gave no load for are missing, not zero", () => {
    const l = loadPerSlot([run("2026-11-02", null)], [], slots, "all");
    expect(l[0]).toMatchObject({ total: null, workouts: 1, unscored: 1 });
  });

  it("a day with one scored and one unscored workout adds up the scored one and says one is missing", () => {
    const l = loadPerSlot([run("2026-11-02", 80), run("2026-11-02", null)], [], slots, "all");
    expect(l[0]).toMatchObject({ total: 80, unscored: 1, workouts: 2 });
  });

  it("the filter leaves out the other kind completely, including its unscored workouts", () => {
    const runs = [run("2026-11-02", 100)];
    const sessions = [session("2026-11-02", 30), session("2026-11-02", null)];
    expect(loadPerSlot(runs, sessions, slots, "run")[0]).toMatchObject({ run: 100, strength: 0, total: 100, workouts: 1, unscored: 0 });
    expect(loadPerSlot(runs, sessions, slots, "strength")[0]).toMatchObject({ run: 0, strength: 30, total: 30, workouts: 2, unscored: 1 });
  });

  it("weekly adds up the whole week, and uses the Paris day for a late run", () => {
    const week = buildSlots({ from: "2026-11-02", to: "2026-11-08" }, "weekly");
    const late = { ...run("2026-11-08", 50), started_at: "2026-11-08T23:30:00Z" }; // 00:30 on Monday 9 Nov in Paris
    const l = loadPerSlot([run("2026-11-03", 100), late], [session("2026-11-05", 30)], week, "all");
    expect(l[0]).toMatchObject({ run: 100, strength: 30, total: 130 });
  });
});
