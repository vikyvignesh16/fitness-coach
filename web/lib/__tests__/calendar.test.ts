import { describe, expect, it } from "vitest";
import { buildMonth, monthLabel, parseMonth, shiftMonth } from "../calendar";
import type { PlanDay, RunRow } from "../types";

const day = (date: string, week: number, type: string, km: number, gym = false): PlanDay => ({
  date,
  week,
  run: { type, distance_km: km },
  gym: gym ? { session: "Upper", key_exercises: [{ name: "Row", sets: 3, reps: "8", rir: 2 }] } : null,
});
const run = (id: string, started_at: string, km: number): RunRow => ({
  coros_id: id, started_at, distance_km: km, duration_s: km * 330, avg_hr: null,
});

describe("buildMonth", () => {
  const days = [
    day("2026-11-02", 2, "recovery", 5),
    day("2026-11-03", 2, "no_run", 0),
    day("2026-11-08", 2, "long_run", 14, true),
  ];
  const runs = [run("a", "2026-11-02T06:00:00+00:00", 5.1)];
  const weeks = buildMonth("2026-11", days, runs, "2026-11-04", [2]);
  const all = weeks.flat();
  const cell = (date: string) => all.find((c) => c.date === date)!;

  it("has full Monday to Sunday rows", () => {
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // November 2026 starts on a Sunday, so the first row starts Monday 26 Oct.
    expect(weeks[0][0].date).toBe("2026-10-26");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][6].date).toBe("2026-11-01");
    expect(weeks.at(-1)![6].date).toBe("2026-12-06");
  });

  it("marks the first and last day of the month and none outside it", () => {
    expect(cell("2026-11-01").inMonth).toBe(true);
    expect(cell("2026-11-30").inMonth).toBe(true);
    expect(cell("2026-12-01").inMonth).toBe(false);
  });

  it("shows the planned run, the done distance, gym and today", () => {
    expect(cell("2026-11-02")).toMatchObject({ plannedKm: 5, runType: "recovery", doneKm: 5.1, inPlan: true, locked: true });
    expect(cell("2026-11-08")).toMatchObject({ plannedKm: 14, gym: true, doneKm: null });
    expect(cell("2026-11-04").today).toBe(true);
  });

  it("leaves rest days and days outside the plan without a run", () => {
    expect(cell("2026-11-03")).toMatchObject({ plannedKm: null, runType: null, inPlan: true });
    expect(cell("2026-11-20")).toMatchObject({ plannedKm: null, inPlan: false, locked: false });
  });

  it("keeps a run done on a day with no plan row", () => {
    const m = buildMonth("2026-11", [], runs, "2026-11-04", []).flat();
    expect(m.find((c) => c.date === "2026-11-02")!.doneKm).toBe(5.1);
  });

  it("puts a late evening run on the Paris day, not the UTC day", () => {
    const late = [run("b", "2026-11-09T23:30:00+00:00", 6)]; // 00:30 on the 10th in Paris
    const m = buildMonth("2026-11", [], late, "2026-11-04", []).flat();
    expect(m.find((c) => c.date === "2026-11-10")!.doneKm).toBe(6);
    expect(m.find((c) => c.date === "2026-11-09")!.doneKm).toBeNull();
  });

  it("fits a month that is exactly four weeks (February 2027)", () => {
    const feb = buildMonth("2027-02", [], [], "2027-02-10", []);
    expect(feb).toHaveLength(4);
    expect(feb[0][0].date).toBe("2027-02-01");
  });

  it("rejects a bad month", () => {
    expect(() => buildMonth("2026-13", [], [], "2026-11-04", [])).toThrow();
  });
});

describe("month helpers", () => {
  it("accepts a good month and falls back to today's month otherwise", () => {
    expect(parseMonth("2027-01", "2026-11-04")).toBe("2027-01");
    for (const bad of [undefined, "", "2027-13", "2027-1", "nonsense", ["2027-01"]]) {
      expect(parseMonth(bad, "2026-11-04")).toBe("2026-11");
    }
  });

  it("moves across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });

  it("names the month", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});
