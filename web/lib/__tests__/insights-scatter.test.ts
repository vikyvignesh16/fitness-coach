import { describe, expect, it } from "vitest";
import { effortRank, effortVsHrv, loadVsNextHrv } from "../insights-scatter";
import type { HealthDay, RunRow, StrengthSession } from "../types";
import type { RunForTable } from "../workout-table";

function day(date: string, over: Partial<HealthDay> = {}): HealthDay {
  const nulls = { sleep_score: null, sleep_asleep_min: null, hrv_avg_ms: null, hrv_label: null, hrv_normal_low_ms: null, hrv_normal_high_ms: null, hrv_baseline_ms: null, resting_hr: null, stress_avg: null, load_short: null, load_long: null, load_ratio: null, load_label: null, recovery_last: null, recovery_min: null, recovery_max: null };
  return { ...nulls, day: date, complete: true, ...over } as HealthDay;
}
const run = (id: string, at: string, load: number | null): RunRow => ({ coros_id: id, started_at: at, distance_km: 8, duration_s: 2700, avg_hr: 150, training_load: load });
const gym = (id: string, d: string, load: number | null, effort: string | null = null) =>
  ({ id, day: d, started_at: `${d}T10:00:00Z`, training_load: load, perceived_effort: effort, sets: [] }) as unknown as StrengthSession;
const range = { from: "2026-11-03", to: "2026-11-05" };

describe("effort words", () => {
  it("ranks the five COROS words, ignoring case, and rejects others", () => {
    expect(["Very Easy", "easy", "MODERATE", "Hard", "Very Hard"].map(effortRank)).toEqual([1, 2, 3, 4, 5]);
    expect(effortRank("Very Tired")).toBeNull();
    expect(effortRank(null)).toBeNull();
  });
});

describe("training load against next morning HRV", () => {
  const rows = [
    day("2026-11-03"), day("2026-11-04", { hrv_avg_ms: 60, hrv_baseline_ms: 64 }),
    day("2026-11-05", { hrv_avg_ms: 70, hrv_baseline_ms: 64 }), day("2026-11-06", { hrv_avg_ms: 50, hrv_baseline_ms: 60 }),
  ];

  it("pairs a day's load with the next morning's HRV minus COROS's baseline for that date", () => {
    const r = loadVsNextHrv(rows, [run("a", "2026-11-03T08:00:00Z", 80), run("b", "2026-11-03T17:00:00Z", 20)], [], range);
    expect(r.points[0]).toMatchObject({ day: "2026-11-03", load: 100, rest: false, deviation: -4 });
  });

  it("counts a rest day as zero load when the watch recorded that day", () => {
    const r = loadVsNextHrv(rows, [], [], range);
    expect(r.points.find((p) => p.day === "2026-11-04")).toMatchObject({ load: 0, rest: true, deviation: 6 });
  });

  it("leaves out a day with no watch data and no workout, and counts it", () => {
    const r = loadVsNextHrv([day("2026-11-04", { hrv_avg_ms: 60, hrv_baseline_ms: 64 })], [], [], range);
    expect(r.leftOut.noWatchData).toBe(2);
    expect(r.points.map((p) => p.day)).toEqual(["2026-11-03"].filter(() => false));
  });

  it("leaves out a day with no HRV the next morning", () => {
    const r = loadVsNextHrv([day("2026-11-03"), day("2026-11-04")], [], [], { from: "2026-11-03", to: "2026-11-03" });
    expect(r.points).toEqual([]);
    expect(r.leftOut.noNextHrv).toBe(1);
  });

  it("never turns workouts without a load figure into zero", () => {
    const r = loadVsNextHrv(rows, [run("a", "2026-11-03T08:00:00Z", null)], [], range);
    expect(r.points.find((p) => p.day === "2026-11-03")).toBeUndefined();
    expect(r.leftOut.unscored).toBe(1);
  });

  it("adds gym load to run load", () => {
    const r = loadVsNextHrv(rows, [run("a", "2026-11-03T08:00:00Z", 80)], [gym("g", "2026-11-03", 30)], range);
    expect(r.points[0].load).toBe(110);
  });
});

describe("workout feel against the night's HRV", () => {
  const rows = [day("2026-11-03", { hrv_avg_ms: 61 }), day("2026-11-04", { hrv_avg_ms: null })];
  const r = (id: string, at: string, effort: string | null) => ({ ...run(id, at, 50), perceived_effort: effort, workout_note: null }) as RunForTable;

  it("plots the effort rank against that morning's HRV", () => {
    const res = effortVsHrv(rows, [r("a", "2026-11-03T08:00:00Z", "Hard")], [gym("g", "2026-11-03", 20, "Very Easy")]);
    expect(res.points.map((p) => [p.title, p.effort, p.hrv])).toEqual([["Run", 4, 61], ["Strength", 1, 61]]);
  });

  it("leaves out and counts missing, unknown and HRV-less workouts", () => {
    const res = effortVsHrv(rows, [r("a", "2026-11-03T08:00:00Z", null), r("b", "2026-11-03T09:00:00Z", "Very Tired"), r("c", "2026-11-04T08:00:00Z", "Easy")], []);
    expect(res.points).toEqual([]);
    expect(res.leftOut).toEqual({ noEffort: 1, unknownWord: 1, noHrv: 1 });
  });
});
