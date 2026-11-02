import { describe, expect, it } from "vitest";
import { londonDate, matchRunsToDays, plannedKm, weeklySeries } from "../runs";
import type { PlanDay, PlanWeek, RunRow } from "../types";

const run = (id: string, startedAt: string, km: number, s: number, hr: number | null = 150): RunRow => ({
  coros_id: id, started_at: startedAt, distance_km: km, duration_s: s, avg_hr: hr,
});

const day = (date: string, week: number, type: string, km: number): PlanDay => ({
  date, week, run: { type, distance_km: km }, gym: null,
});

describe("londonDate", () => {
  it("uses the UTC date in winter (GMT)", () => {
    expect(londonDate("2026-10-28T06:03:17+00:00")).toBe("2026-10-28");
    expect(londonDate("2026-12-01T23:30:00+00:00")).toBe("2026-12-01");
  });

  it("moves a late UTC evening run to the next London day in summer (BST)", () => {
    expect(londonDate("2027-07-01T23:30:00+00:00")).toBe("2027-07-02");
  });

  it("handles the clock change day (clocks go back on 25 Oct 2026)", () => {
    expect(londonDate("2026-10-25T00:30:00+00:00")).toBe("2026-10-25"); // 01:30 BST
    expect(londonDate("2026-10-25T23:30:00+00:00")).toBe("2026-10-25"); // 23:30 GMT
  });
});

describe("matchRunsToDays", () => {
  it("groups a single run on its day", () => {
    const m = matchRunsToDays([run("a", "2026-10-28T06:00:00+00:00", 8.01, 2776, 155)]);
    expect(m["2026-10-28"]).toEqual({ distanceKm: 8.01, durationS: 2776, avgHr: 155, runs: 1 });
  });

  it("adds up two runs on one day and weights heart rate by time", () => {
    const m = matchRunsToDays([
      run("a", "2026-10-28T06:00:00+00:00", 5, 1800, 140),
      run("b", "2026-10-28T17:00:00+00:00", 5, 3600, 170),
    ]);
    expect(m["2026-10-28"].distanceKm).toBe(10);
    expect(m["2026-10-28"].durationS).toBe(5400);
    expect(m["2026-10-28"].avgHr).toBe(160); // (140*1800 + 170*3600) / 5400
    expect(m["2026-10-28"].runs).toBe(2);
  });

  it("leaves heart rate empty when no run has one", () => {
    const m = matchRunsToDays([run("a", "2026-10-28T06:00:00+00:00", 5, 1800, null)]);
    expect(m["2026-10-28"].avgHr).toBeNull();
  });

  it("does not add floating point noise", () => {
    const m = matchRunsToDays([
      run("a", "2026-10-28T06:00:00+00:00", 0.1, 60),
      run("b", "2026-10-28T07:00:00+00:00", 0.2, 60),
    ]);
    expect(m["2026-10-28"].distanceKm).toBe(0.3);
  });

  it("returns nothing for no runs", () => {
    expect(matchRunsToDays([])).toEqual({});
  });
});

describe("plannedKm", () => {
  it("counts planned runs and ignores rest and unrecorded days", () => {
    expect(plannedKm(day("2026-11-02", 2, "recovery", 5))).toBe(5);
    expect(plannedKm(day("2026-11-03", 2, "no_run", 0))).toBe(0);
    expect(plannedKm(day("2026-10-26", 1, "not_recorded", 0))).toBe(0);
    expect(plannedKm({ date: "x", week: 1, run: null, gym: null })).toBe(0);
  });
});

describe("weeklySeries", () => {
  const weeks: PlanWeek[] = [
    { week: 2, start_date: "2026-11-02", phase: "Rebuild", total_km: 12 },
    { week: 1, start_date: "2026-10-26", phase: "Actual", total_km: 8.01 },
  ];
  const days = [
    day("2026-10-28", 1, "actual", 8.01),
    day("2026-11-02", 2, "recovery", 5),
    day("2026-11-04", 2, "easy", 7),
  ];

  it("sorts by week and compares planned with actual", () => {
    const s = weeklySeries(weeks, days, [
      run("a", "2026-10-28T06:00:00+00:00", 8.01, 2776),
      run("b", "2026-11-02T06:00:00+00:00", 4.5, 1700),
    ]);
    expect(s.map((p) => p.week)).toEqual([1, 2]);
    expect(s[0]).toMatchObject({ plannedKm: 8.01, actualKm: 8.01 });
    expect(s[1]).toMatchObject({ plannedKm: 12, actualKm: 4.5 });
  });

  it("shows zero actual when nothing was run", () => {
    expect(weeklySeries(weeks, days, []).every((p) => p.actualKm === 0)).toBe(true);
  });

  it("ignores runs on days that are not in the plan", () => {
    const s = weeklySeries(weeks, days, [run("z", "2026-12-25T08:00:00+00:00", 10, 3600)]);
    expect(s.every((p) => p.actualKm === 0)).toBe(true);
  });
});
