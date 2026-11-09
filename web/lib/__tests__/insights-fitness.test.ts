import { describe, expect, it } from "vitest";
import {
  describeGap, efficiencyPoints, fitnessSeries, formatHms, formatPace, gapsToGoals, goalSeconds, goalsFromTargets, longRunPerWeek, monthGroup,
} from "../insights-fitness";
import { buildSlots } from "../insights-series";
import type { HealthDay, RunRow } from "../types";

const run = (date: string, km: number, mins: number, hr: number | null = 150, id = date + km): RunRow =>
  ({ coros_id: id, started_at: `${date}T07:00:00Z`, distance_km: km, duration_s: mins * 60, avg_hr: hr });

describe("formatting and goals", () => {
  it("formats pace and times", () => {
    expect(formatPace(237)).toBe("3:57");
    expect(formatPace(300)).toBe("5:00");
    expect(formatHms(11191)).toBe("3:06:31");
    expect(goalSeconds("3:15:00")).toBe(11700);
  });

  it("builds the three goals from the plan targets", () => {
    const goals = goalsFromTargets({ a: "3:15:00", b: "3:20:00", c: "3:30:00" });
    expect(goals.map((g) => [g.name, g.label, g.seconds])).toEqual([["A", "3:15", 11700], ["B", "3:20", 12000], ["C", "3:30", 12600]]);
  });

  it("measures the gap to each goal and says it in words", () => {
    const gaps = gapsToGoals(11191, goalsFromTargets({ a: "3:15:00", b: "3:20:00", c: "3:30:00" }));
    expect(gaps.map((g) => g.gapS)).toEqual([-509, -809, -1409]);
    expect(describeGap(-509)).toBe("8:29 faster than the goal");
    expect(describeGap(65)).toBe("1:05 slower than the goal");
    expect(describeGap(0)).toBe("on the goal");
  });
});

describe("long run per week", () => {
  const runs = [run("2026-11-02", 8, 50), run("2026-11-04", 14, 85), run("2026-11-08", 10, 60), run("2026-10-26", 21.1, 130)];
  const weeks = longRunPerWeek(runs, { from: "2026-10-26", to: "2026-11-09" });

  it("takes the longest run of each week and counts that week's runs", () => {
    expect(weeks.map((w) => [w.weekStart, w.km, w.runsThatWeek])).toEqual([["2026-10-26", 21.1, 1], ["2026-11-02", 14, 3], ["2026-11-09", null, 0]]);
  });

  it("carries that run's duration, pace and heart rate", () => {
    expect(weeks[1]).toMatchObject({ durationS: 5100, paceS: 364, avgHr: 150 });
  });

  it("a week with no run has no column, not a zero", () => {
    expect(weeks[2].km).toBeNull();
  });
});

describe("fitness series", () => {
  const row = (day: string, over: Partial<HealthDay>) => ({ day, vo2max: null, threshold_pace_s: null, pred_marathon_s: null, ...over }) as HealthDay;
  const slots = buildSlots({ from: "2026-11-03", to: "2026-11-09" }, "daily");

  it("shows the one value COROS gave and nothing for the other days", () => {
    const pts = fitnessSeries([row("2026-11-09", { vo2max: 50, threshold_pace_s: 237, pred_marathon_s: 11191 })], slots);
    expect(pts.filter((p) => p.vo2max !== null)).toHaveLength(1);
    expect(pts[6]).toMatchObject({ vo2max: 50, thresholdS: 237, marathonS: 11191, isolated: true });
    expect(pts[0]).toMatchObject({ vo2max: null, isolated: false });
  });

  it("two days in a row are a line, so neither needs a dot", () => {
    const pts = fitnessSeries([row("2026-11-08", { vo2max: 50 }), row("2026-11-09", { vo2max: 51 })], slots);
    expect(pts[5].isolated).toBe(false);
    expect(pts[6].isolated).toBe(false);
  });

  it("weekly takes the newest value in the week", () => {
    const weekly = buildSlots({ from: "2026-11-02", to: "2026-11-08" }, "weekly");
    expect(fitnessSeries([row("2026-11-03", { vo2max: 49 }), row("2026-11-07", { vo2max: 50 })], weekly)[0].vo2max).toBe(50);
  });
});

describe("running efficiency", () => {
  const plan = { "2026-11-03": "easy", "2026-11-05": "recovery", "2026-11-06": "quality", "2026-10-20": "easy", "2026-11-07": "easy_strides", "2026-11-08": "easy" };
  const runs = [
    run("2026-11-03", 8, 48, 150), run("2026-11-05", 5, 33, 140), run("2026-11-06", 8, 40, 170), run("2026-10-20", 12, 75, 148),
    run("2026-11-07", 8, 48, 150), run("2026-11-08", 8, 48, null), run("2026-11-09", 8, 48, 150),
  ];
  const range = { from: "2026-10-01", to: "2026-11-09", dist: "all" as const };
  const pts = efficiencyPoints(runs, plan, range, "2026-11-09");

  it("keeps only easy and recovery runs that have a heart rate, and drops quality, strides and unplanned days", () => {
    expect(pts.map((p) => p.date)).toEqual(["2026-10-20", "2026-11-03", "2026-11-05"]);
  });

  it("pace is the whole run time over the distance, in seconds per km", () => {
    expect(pts[1]).toMatchObject({ km: 8, hr: 150, paceS: 360 });
  });

  it("filters by distance band, both ends included", () => {
    expect(efficiencyPoints(runs, plan, { ...range, dist: "5-10" }, "2026-11-09").map((p) => p.km)).toEqual([8, 5]);
    expect(efficiencyPoints(runs, plan, { ...range, dist: "10-16" }, "2026-11-09").map((p) => p.km)).toEqual([12]);
  });

  it("only uses runs inside the date range", () => {
    expect(efficiencyPoints(runs, plan, { ...range, from: "2026-11-01" }, "2026-11-09")).toHaveLength(2);
  });

  it("groups by month: this, last, the one before, and earlier", () => {
    expect(monthGroup("2026-11-03", "2026-11-09")).toBe("this");
    expect(monthGroup("2026-10-20", "2026-11-09")).toBe("last");
    expect(monthGroup("2026-09-30", "2026-11-09")).toBe("before");
    expect(monthGroup("2026-08-30", "2026-11-09")).toBe("earlier");
    expect(monthGroup("2026-12-15", "2027-01-10")).toBe("last"); // across a year change
  });
});
