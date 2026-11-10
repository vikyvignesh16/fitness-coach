import { describe, expect, it } from "vitest";
import { buildFlags, FLAG_LIMITS } from "../insights-flags";
import type { HealthDay } from "../types";
import { addDays } from "../weeks";

const today = "2026-11-10";
const nulls = { sleep_score: null, sleep_asleep_min: null, hrv_avg_ms: null, hrv_label: null, hrv_normal_low_ms: null, hrv_normal_high_ms: null, hrv_baseline_ms: null, resting_hr: null, stress_avg: null, load_short: null, load_long: null, load_ratio: null, load_label: null, recovery_last: null, recovery_min: null, recovery_max: null };
const row = (d: string, over: Partial<HealthDay> = {}) => ({ ...nulls, day: d, complete: true, ...over }) as HealthDay;
/** `n` days ending on `today`, newest last, each built from its index (0 = oldest). */
const span = (n: number, make: (i: number, d: string) => Partial<HealthDay>) =>
  Array.from({ length: n }, (_, i) => { const d = addDays(today, -(n - 1 - i)); return row(d, make(i, d)); });
const find = (rows: HealthDay[], id: string) => buildFlags(rows, today).find((f) => f.id === id)!;

describe("HRV under the normal range", () => {
  const nights = (low: number) => span(7, (i) => ({ hrv_avg_ms: i < low ? 40 : 60, hrv_normal_low_ms: 50 }));
  it("flags 3 of the last 7 nights", () => expect(find(nights(3), "hrv").state).toBe("flag"));
  it("does not flag 2 of 7", () => expect(find(nights(2), "hrv").state).toBe("ok"));
  it("says not checked with fewer than 5 nights of data", () => expect(find(span(4, () => ({ hrv_avg_ms: 40, hrv_normal_low_ms: 50 })), "hrv").state).toBe("nodata"));
});

describe("resting heart rate", () => {
  const make = (last: number[]) => [...span(28, () => ({ resting_hr: 50 })).slice(0, 25).map((r) => ({ ...r, day: addDays(r.day, -3) })), ...last.map((v, i) => row(addDays(today, -(last.length - 1 - i)), { resting_hr: v }))];
  it("flags 5 bpm over the average three days running", () => expect(find(make([56, 56, 56]), "rhr").state).toBe("flag"));
  it("does not flag when one of the three is under", () => expect(find(make([56, 53, 56]), "rhr").state).toBe("ok"));
  it("does not flag 4 over", () => expect(find(make([54, 54, 54]), "rhr").state).toBe("ok"));
});

describe("short sleep", () => {
  const nights = (short: number) => span(7, (i) => ({ sleep_asleep_min: i < short ? 340 : 450 }));
  it("flags 3 nights under 6 hours", () => expect(find(nights(3), "sleep").state).toBe("flag"));
  it("exactly 6 hours is not short", () => expect(find(span(7, () => ({ sleep_asleep_min: 360 })), "sleep").state).toBe("ok"));
  it("does not flag 2", () => expect(find(nights(2), "sleep").state).toBe("ok"));
});

describe("training load ratio", () => {
  it("flags above 1.3 for three days", () => expect(find(span(3, () => ({ load_ratio: 1.4 })), "load").state).toBe("flag"));
  it("exactly 1.3 is not above", () => expect(find(span(3, () => ({ load_ratio: 1.3 })), "load").state).toBe("ok"));
  it("a gap day means not checked, never a pass", () => expect(find([row(today, { load_ratio: 1.5 }), row(addDays(today, -2), { load_ratio: 1.5 })], "load").state).toBe("nodata"));
});

describe("stress", () => {
  const make = (week: number) => span(35, (i) => ({ stress_avg: i >= 28 ? week : 30 }));
  it("flags a week 10 or more over the 28 day average", () => expect(find(make(41), "stress").state).toBe("flag"));
  it("does not flag 9 over", () => expect(find(make(38), "stress").state).toBe("ok"));
});

describe("recovery", () => {
  it("flags under 50 on two days in a row", () => expect(find(span(2, () => ({ recovery_last: 45 })), "recovery").state).toBe("flag"));
  it("exactly 50 is fine", () => expect(find(span(2, () => ({ recovery_last: 50 })), "recovery").state).toBe("ok"));
  it("one low day is fine", () => expect(find(span(2, (i) => ({ recovery_last: i ? 45 : 80 })), "recovery").state).toBe("ok"));
});

describe("overall", () => {
  it("always returns all six checks, and no data is nodata, never ok", () => {
    const flags = buildFlags([], today);
    expect(flags.map((f) => f.id)).toEqual(["hrv", "rhr", "sleep", "load", "stress", "recovery"]);
    expect(flags.every((f) => f.state === "nodata")).toBe(true);
  });
  it("holds the approved numbers", () => {
    expect(FLAG_LIMITS).toMatchObject({ hrvNights: 3, rhrAbove: 5, rhrDays: 3, sleepMin: 360, sleepNights: 3, loadRatio: 1.3, loadDays: 3, stressAbove: 10, recoveryBelow: 50, recoveryDays: 2 });
  });
});
