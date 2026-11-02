import { describe, expect, it } from "vitest";
import { checkinDue, currentWeekNumber, dayMonth, gatePassed, todayLondon, weekdayShort } from "../weeks";
import { isRestDay, runLabel } from "../labels";
import type { PlanWeek } from "../types";

const weeks: PlanWeek[] = [
  { week: 1, start_date: "2026-10-26", phase: "Actual", total_km: 8 },
  { week: 2, start_date: "2026-11-02", phase: "Rebuild", total_km: 32 },
  { week: 3, start_date: "2026-11-09", phase: "Base", total_km: 36 },
];

describe("currentWeekNumber", () => {
  it("finds the week that contains today, Monday to Sunday", () => {
    expect(currentWeekNumber(weeks, "2026-11-02")).toBe(2); // Monday
    expect(currentWeekNumber(weeks, "2026-11-08")).toBe(2); // Sunday
    expect(currentWeekNumber(weeks, "2026-11-09")).toBe(3);
  });

  it("uses the first week before the plan and the last week after it", () => {
    expect(currentWeekNumber(weeks, "2026-09-01")).toBe(1);
    expect(currentWeekNumber(weeks, "2027-06-01")).toBe(3);
  });

  it("works when the weeks arrive out of order", () => {
    expect(currentWeekNumber([...weeks].reverse(), "2026-11-04")).toBe(2);
  });

  it("refuses an empty plan", () => {
    expect(() => currentWeekNumber([], "2026-11-02")).toThrow();
  });
});

describe("dates", () => {
  it("gives London's date, not UTC's, late on a summer evening", () => {
    expect(todayLondon(new Date("2027-07-01T23:30:00Z"))).toBe("2027-07-02");
    expect(todayLondon(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-02");
  });

  it("names the weekday and day and month without timezone drift", () => {
    expect(weekdayShort("2026-11-02")).toBe("Mon");
    expect(weekdayShort("2027-04-04")).toBe("Sun");
    expect(dayMonth("2026-11-02")).toBe("2 Nov");
  });
});

describe("gatePassed", () => {
  it("is false with no record", () => {
    expect(gatePassed([])).toBe(false);
  });

  it("follows the newest record, so a later fail overrides an earlier pass", () => {
    expect(gatePassed([
      { passed: true, created_at: "2026-11-02T10:00:00Z" },
      { passed: false, created_at: "2026-11-03T10:00:00Z" },
    ])).toBe(false);
    expect(gatePassed([
      { passed: false, created_at: "2026-11-02T10:00:00Z" },
      { passed: true, created_at: "2026-11-03T10:00:00Z" },
    ])).toBe(true);
  });

  it("does not treat a null result as a pass", () => {
    expect(gatePassed([{ passed: null, created_at: "2026-11-02T10:00:00Z" }])).toBe(false);
  });
});

describe("labels", () => {
  it("names run types in plain words and falls back for unknown ones", () => {
    expect(runLabel("long_run")).toBe("Long run");
    expect(runLabel("10k_test")).toBe("10K time trial");
    expect(runLabel("some_new_type")).toBe("some new type");
  });

  it("knows rest days", () => {
    expect(isRestDay("no_run")).toBe(true);
    expect(isRestDay("not_recorded")).toBe(true);
    expect(isRestDay(undefined)).toBe(true);
    expect(isRestDay("easy")).toBe(false);
  });
});


describe("checkinDue", () => {
  it("stays quiet Monday to Friday", () => {
    for (const day of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
      expect(checkinDue(day, false), day).toBe(false);
    }
  });

  it("reminds on Saturday and Sunday when this week's check in is not done", () => {
    expect(checkinDue("2026-11-07", false)).toBe(true); // Saturday
    expect(checkinDue("2026-11-08", false)).toBe(true); // Sunday
  });

  it("stays quiet once this week's check in is done", () => {
    expect(checkinDue("2026-11-08", true)).toBe(false);
  });
});
