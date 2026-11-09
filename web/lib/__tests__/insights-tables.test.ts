import { describe, expect, it } from "vitest";
import { hrvTable, scoreTable, sleepTable, volumeTable } from "../insights-tables";

describe("chart data tables", () => {
  it("writes sleep stages as hours and minutes, and a missing night as null so it prints as no data", () => {
    const t = sleepTable([
      { key: "a", label: "4 Nov", deep: 1.65, rem: 2.3, light: 4.18, awake: 0.48, asleepMin: 488, periodMin: 517, napMin: 0 },
      { key: "b", label: "5 Nov", deep: null, rem: null, light: null, awake: null, asleepMin: null, periodMin: null, napMin: null },
    ], "daily");
    expect(t.rows[0]).toEqual(["4 Nov", "1h 39m", "2h 18m", "4h 11m", "29m", "8h 08m", "8h 37m"]);
    expect(t.rows[1].slice(1)).toEqual([null, null, null, null, null, null]);
    expect(t.columns[0]).toBe("Day");
  });

  it("names the first column by the view", () => {
    expect(scoreTable([], "weekly").columns[0]).toBe("Week starting");
  });

  it("a score row says whether the night was marked, but only when there was a score", () => {
    const t = scoreTable([
      { key: "a", label: "a", score: 40, baseline: 80, low: true, isolated: false },
      { key: "b", label: "b", score: null, baseline: 80, low: false, isolated: false },
    ], "daily");
    expect(t.rows.map((r) => r[3])).toEqual(["yes", null]);
  });

  it("shows the HRV normal range as text", () => {
    const t = hrvTable([{ key: "a", label: "a", hrv: 44, avg7: null, bandLow: 54, bandHigh: 68, band: [54, 68], status: "Low", baseline: 61, isolated: false }], "daily");
    expect(t.rows[0]).toEqual(["a", 44, null, "54 to 68", "Low"]);
  });

  it("marks a week in progress and signs the change", () => {
    const t = volumeTable([
      { weekStart: "w1", label: "2 Nov", km: 50, runs: 4, changePct: 25, avg4: 40, inProgress: false },
      { weekStart: "w2", label: "9 Nov", km: 10, runs: 1, changePct: null, avg4: null, inProgress: true },
    ]);
    expect(t.rows[0]).toEqual(["2 Nov", 50, 4, "+25%", 40]);
    expect(t.rows[1]).toEqual(["9 Nov (in progress)", 10, 1, null, null]);
  });
});
