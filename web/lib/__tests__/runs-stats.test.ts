import { describe, expect, it } from "vitest";
import { caloriesFrom, filterRuns, parseRange, rangeStart, summarise } from "../runs-stats";
import { mondayOf } from "../weeks";
import type { RunRow } from "../types";

const run = (id: string, startedAt: string, km: number, s = 1800): RunRow => ({
  coros_id: id, started_at: startedAt, distance_km: km, duration_s: s, avg_hr: 150,
});

describe("mondayOf", () => {
  it("finds the Monday for any day of the week", () => {
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(mondayOf("2026-11-04")).toBe("2026-11-02"); // Wednesday
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
  });

  it("works across a month and a year", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28"); // Friday
  });
});

describe("parseRange", () => {
  it("accepts the three ranges and falls back to month", () => {
    expect(parseRange("week")).toBe("week");
    expect(parseRange("all")).toBe("all");
    expect(parseRange(undefined)).toBe("month");
    expect(parseRange("year")).toBe("month");
    expect(parseRange(["week", "all"])).toBe("week");
  });
});

describe("rangeStart", () => {
  it("starts the week on Monday, the month on the 1st, and has no start for all", () => {
    expect(rangeStart("week", "2026-11-04")).toBe("2026-11-02");
    expect(rangeStart("month", "2026-11-04")).toBe("2026-11-01");
    expect(rangeStart("all", "2026-11-04")).toBeNull();
  });
});

describe("filterRuns", () => {
  const runs = [
    run("old", "2026-10-12T06:00:00+00:00", 6.02),
    run("last-sun", "2026-11-01T09:00:00+00:00", 14),
    run("mon", "2026-11-02T06:00:00+00:00", 5),
    run("wed", "2026-11-04T06:00:00+00:00", 7),
  ];

  it("keeps this week's runs, newest first", () => {
    expect(filterRuns(runs, "week", "2026-11-04").map((r) => r.coros_id)).toEqual(["wed", "mon"]);
  });

  it("keeps this month's runs", () => {
    expect(filterRuns(runs, "month", "2026-11-04").map((r) => r.coros_id)).toEqual(["wed", "mon", "last-sun"]);
  });

  it("keeps everything for all, newest first", () => {
    expect(filterRuns(runs, "all", "2026-11-04").map((r) => r.coros_id)).toEqual(["wed", "mon", "last-sun", "old"]);
  });

  it("uses Paris days: just after Paris midnight on Monday counts for the new week", () => {
    // 22:30 UTC on Sunday 6 June is 00:30 CEST on Monday 7 June in Paris
    const justAfter = [run("a", "2027-06-06T22:30:00+00:00", 5)];
    expect(filterRuns(justAfter, "week", "2027-06-07")).toHaveLength(1);
  });

  it("uses Paris days: just before Paris midnight on Sunday is still last week", () => {
    // 21:30 UTC on Sunday 6 June is 23:30 CEST the same Sunday
    const justBefore = [run("b", "2027-06-06T21:30:00+00:00", 5)];
    expect(filterRuns(justBefore, "week", "2027-06-07")).toHaveLength(0);
  });

  it("does not change the list it was given", () => {
    const before = runs.map((r) => r.coros_id);
    filterRuns(runs, "all", "2026-11-04");
    expect(runs.map((r) => r.coros_id)).toEqual(before);
  });
});

describe("summarise", () => {
  it("adds up distance, time and count without float noise", () => {
    const s = summarise([run("a", "2026-11-02T06:00:00+00:00", 0.1, 60), run("b", "2026-11-03T06:00:00+00:00", 0.2, 90)]);
    expect(s).toEqual({ count: 2, km: 0.3, durationS: 150 });
  });

  it("handles no runs", () => {
    expect(summarise([])).toEqual({ count: 0, km: 0, durationS: 0 });
  });
});

describe("caloriesFrom", () => {
  it("reads calories from the saved watch text", () => {
    expect(caloriesFrom({ text: "Average Pace: 5:47 /km | Avg HR: 155 bpm | Calories: 741 kcal\n" })).toBe(741);
  });

  it("returns null when there is none or the data is odd", () => {
    expect(caloriesFrom({ text: "no calories here" })).toBeNull();
    expect(caloriesFrom(null)).toBeNull();
    expect(caloriesFrom({ text: 5 })).toBeNull();
  });
});
