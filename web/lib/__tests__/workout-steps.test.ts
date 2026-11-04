import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeSteps } from "../workout-steps";
import type { PlanRun, PlanStep } from "../types";

const run = (steps: PlanStep[]): PlanRun => ({ type: "easy", distance_km: 1, steps });

describe("describeSteps", () => {
  it("writes a plain run with pace and effort", () => {
    const r = run([{ step: "run", distance_km: 14, pace_min_per_km: "5:40–6:20", effort: "RPE 3–4/10" }]);
    expect(describeSteps(r)).toEqual(["Run 14 km, pace 5:40–6:20 per km, RPE 3–4/10"]);
  });

  it("writes warm up, short repeats and cool down (easy strides)", () => {
    const r = run([
      { step: "warm_up", distance_km: 2.4, effort: "RPE 3/10; easy" },
      {
        step: "repeats",
        repetitions: 6,
        work: { duration_sec: 20, effort: "RPE 7/10; relaxed fast, not sprint" },
        recovery: { duration_sec: 80, effort: "walk/jog RPE 1–2" },
      },
      { step: "cool_down", distance_km: 3.0, effort: "RPE 3/10; easy" },
    ]);
    expect(describeSteps(r)).toEqual([
      "Warm up 2.4 km, RPE 3/10; easy",
      "6 times: 20 s (RPE 7/10; relaxed fast, not sprint), then 80 s (walk/jog RPE 1–2)",
      "Cool down 3 km, RPE 3/10; easy",
    ]);
  });

  it("writes repeats timed in minutes and a cool down with no set distance", () => {
    const r = run([
      { step: "repeats", repetitions: 3, work: { duration_min: 5, effort: "RPE 6/10" }, recovery: { duration_min: 2, effort: "easy jog" } },
      { step: "cool_down", effort: "RPE 3/10", duration_min: "until planned total distance" },
    ]);
    expect(describeSteps(r)).toEqual([
      "3 times: 5 min (RPE 6/10), then 2 min (easy jog)",
      "Cool down until planned total distance, RPE 3/10",
    ]);
  });

  it("writes a single long effort with no recovery as a main set", () => {
    const r = run([
      { step: "repeats", repetitions: 1, work: { distance_km: 10, effort: "10K test" }, recovery: null },
    ]);
    expect(describeSteps(r)).toEqual(["Main set: 10 km (10K test)"]);
  });

  it("says so when a warm up is off the record (race days)", () => {
    const r = run([{ step: "warm_up", distance_km: 0, effort: "5–10 min walk and dynamic movements" }]);
    expect(describeSteps(r)).toEqual(["Warm up off the record, no run distance: 5–10 min walk and dynamic movements"]);
  });

  it("gives distance based repeats with a pace", () => {
    const r = run([
      {
        step: "repeats",
        repetitions: 5,
        work: { distance_km: 0.8, pace_min_per_km: "4:15–4:25" },
        recovery: { duration_min: 2, pace_min_per_km: "6:00–6:40" },
      },
    ]);
    expect(describeSteps(r)).toEqual(["5 times: 0.8 km (pace 4:15–4:25 per km), then 2 min (pace 6:00–6:40 per km)"]);
  });

  it("returns nothing for a day without steps, and never throws on an unknown step", () => {
    expect(describeSteps(null)).toEqual([]);
    expect(describeSteps({ type: "no_run", distance_km: 0 })).toEqual([]);
    expect(describeSteps(run([{ step: "strides_block" }]))).toEqual(["strides block"]);
  });
});

describe("describeSteps on the real plan v5.1", () => {
  const plan = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../../../data/paris_marathon_2027_v5_1_coros_ready.json"), "utf8"),
  );
  const runs: PlanRun[] = plan.weeks.flatMap((w: { days: { run?: PlanRun }[] }) => w.days.map((d) => d.run)).filter((r: PlanRun | undefined) => r?.steps?.length);

  it("has the 101 planned runs we expect", () => {
    expect(runs).toHaveLength(101);
  });

  it("writes exactly one non empty line per step, and never shows undefined or NaN", () => {
    for (const r of runs) {
      const lines = describeSteps(r);
      expect(lines).toHaveLength(r.steps!.length);
      for (const l of lines) {
        expect(l.length).toBeGreaterThan(3);
        expect(l).not.toMatch(/undefined|NaN|null|\[object/);
      }
    }
  });

  it("keeps every distance the plan gave a step", () => {
    for (const r of runs) {
      const lines = describeSteps(r);
      r.steps!.forEach((s, i) => {
        if (s.distance_km) expect(lines[i]).toContain(`${Number(s.distance_km.toFixed(2))} km`);
        if (s.work?.distance_km) expect(lines[i]).toContain(`${Number(s.work.distance_km.toFixed(2))} km`);
      });
    }
  });
});
