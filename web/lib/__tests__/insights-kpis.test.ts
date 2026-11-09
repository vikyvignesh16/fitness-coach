import { describe, expect, it } from "vitest";
import { baselineBefore, buildKpis, compareToBaseline, formatMinutes, formatPaceSeconds, latestWith } from "../insights-kpis";
import type { HealthDay, RecoverySnapshot } from "../types";
import { addDays } from "../weeks";

const today = "2026-11-09";

function day(date: string, over: Partial<HealthDay> = {}): HealthDay {
  const blank = Object.fromEntries(
    ["sleep_score", "sleep_asleep_min", "sleep_total_min", "sleep_period_min", "sleep_deep_min", "sleep_light_min", "sleep_rem_min",
      "sleep_awake_min", "sleep_nap_min", "hrv_avg_ms", "hrv_label", "hrv_normal_low_ms", "hrv_normal_high_ms", "hrv_baseline_ms",
      "resting_hr", "hr_avg", "stress_avg", "steps", "exercise_min", "load_short", "load_long", "load_ratio", "load_label",
      "recovery_avg", "recovery_min", "recovery_max", "recovery_last", "vo2max", "running_level", "threshold_pace_s",
      "pred_5k_s", "pred_10k_s", "pred_half_s", "pred_marathon_s"].map((k) => [k, null]),
  );
  return { ...blank, day: date, complete: true, ...over } as HealthDay;
}

/** n days ending the day before `end`, all with the same value for one field. */
function run(end: string, n: number, over: Partial<HealthDay>): HealthDay[] {
  return Array.from({ length: n }, (_, i) => day(addDays(end, -(i + 1)), over));
}

const snapshot: RecoverySnapshot = { taken_at: "2026-11-09T11:35:00Z", recovery_pct: 96, level: "Fresh", full_recovery_h: 14 };

describe("formatting", () => {
  it("formats minutes and pace", () => {
    expect(formatMinutes(460)).toBe("7h 40m");
    expect(formatMinutes(125)).toBe("2h 05m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatPaceSeconds(237)).toBe("3:57 /km");
  });
});

describe("latestWith", () => {
  it("skips days with no value and takes the newest one that has it, whatever the row order", () => {
    const rows = [day("2026-11-05", { resting_hr: 53 }), day("2026-11-08", { resting_hr: 55 }), day("2026-11-09")];
    expect(latestWith(rows, (r) => r.resting_hr)).toMatchObject({ value: 55, row: { day: "2026-11-08" } });
  });

  it("treats a real zero as a value, not as missing", () => {
    expect(latestWith([day("2026-11-08", { steps: 0 })], (r) => r.steps)?.value).toBe(0);
  });

  it("is null when no day has a value", () => {
    expect(latestWith([day("2026-11-08")], (r) => r.resting_hr)).toBeNull();
  });
});

describe("baselineBefore", () => {
  it("averages the 28 days before the day, without the day itself", () => {
    const rows = [...run("2026-11-08", 10, { resting_hr: 50 }), day("2026-11-08", { resting_hr: 90 })];
    expect(baselineBefore(rows, (r) => r.resting_hr, "2026-11-08")).toBe(50);
  });

  it("ignores days older than 28 days", () => {
    const rows = [...run("2026-11-08", 6, { resting_hr: 50 }), day("2026-09-01", { resting_hr: 100 })];
    expect(baselineBefore(rows, (r) => r.resting_hr, "2026-11-08")).toBe(50);
  });

  it("ignores empty days, so a gap does not pull the average down", () => {
    const rows = [...run("2026-11-08", 5, { resting_hr: 50 }), ...run("2026-11-03", 5, {})];
    expect(baselineBefore(rows, (r) => r.resting_hr, "2026-11-08")).toBe(50);
  });

  it("needs at least 5 real values", () => {
    expect(baselineBefore(run("2026-11-08", 4, { resting_hr: 50 }), (r) => r.resting_hr, "2026-11-08")).toBeNull();
    expect(baselineBefore(run("2026-11-08", 5, { resting_hr: 50 }), (r) => r.resting_hr, "2026-11-08")).toBe(50);
  });
});

describe("compareToBaseline", () => {
  it("says above, below or in line, in whole numbers", () => {
    expect(compareToBaseline(60, 54.2)).toBe("6 above your 28 day average");
    expect(compareToBaseline(50, 54.2)).toBe("4 below your 28 day average");
    expect(compareToBaseline(54.4, 54.2)).toBe("In line with your 28 day average");
    expect(compareToBaseline(60, null)).toBeNull();
  });
});

describe("buildKpis", () => {
  const rows = [
    ...run("2026-11-08", 8, { sleep_score: 78, resting_hr: 54 }),
    day("2026-11-08", {
      sleep_score: 84, sleep_asleep_min: 488, hrv_avg_ms: 44, hrv_label: "Low", hrv_normal_low_ms: 54, hrv_normal_high_ms: 68,
      resting_hr: 55, load_short: 72, load_long: 65, load_ratio: 1.1, load_label: "Optimized",
    }),
    day("2026-11-09", { vo2max: 50, threshold_pace_s: 237 }),
  ];
  const cards = buildKpis(rows, snapshot, today);
  const by = (id: string) => cards.find((c) => c.id === id)!;

  it("returns the six cards in the order of the spec, with no combined score", () => {
    expect(cards.map((c) => c.id)).toEqual(["sleep", "hrv", "resting-hr", "recovery", "training-load", "fitness"]);
  });

  it("sleep shows time asleep, the score and how it compares", () => {
    expect(by("sleep")).toMatchObject({ value: "8h 08m", unit: "asleep", measured: "Night ending 8 Nov" });
    expect(by("sleep").lines).toEqual(["Score 84", "6 above your 28 day average"]);
  });

  it("HRV shows the COROS label and normal range", () => {
    expect(by("hrv")).toMatchObject({ value: "44", unit: "ms", lines: ["Low · normal 54 to 68 ms"] });
  });

  it("resting heart rate compares with its own baseline", () => {
    expect(by("resting-hr")).toMatchObject({ value: "55", unit: "bpm", lines: ["1 above your 28 day average"] });
  });

  it("recovery shows when the snapshot was taken", () => {
    expect(by("recovery")).toMatchObject({ value: "96", unit: "%", lines: ["Fresh · full in about 14 h"], measured: "Updated 12:35" });
  });

  it("training load shows COROS short and long term numbers, and the ratio", () => {
    expect(by("training-load")).toMatchObject({ value: "1.10", lines: ["Short-term 72 · long-term 65", "Optimized"] });
  });

  it("fitness shows VO2max and threshold pace", () => {
    expect(by("fitness")).toMatchObject({ value: "50", unit: "VO2max", lines: ["Threshold pace 3:57 /km"], measured: "9 Nov" });
  });

  it("a night with no score still shows its sleep time and says so", () => {
    const k = buildKpis([day("2026-11-08", { sleep_asleep_min: 27 })], null, today).find((c) => c.id === "sleep")!;
    expect(k.value).toBe("27m");
    expect(k.lines).toEqual(["No score for this night"]);
  });

  it("no data is shown as no data, never as zero", () => {
    const k = buildKpis([], null, today);
    for (const card of k) {
      expect(card.value).toBeNull();
      expect(card.lines).toEqual(["No data yet"]);
    }
  });

  it("marks a number older than two days as stale", () => {
    const k = buildKpis([day("2026-11-05", { resting_hr: 55 }), day("2026-11-07", { vo2max: 50 })], null, today);
    expect(k.find((c) => c.id === "resting-hr")!.stale).toBe(true);
    expect(k.find((c) => c.id === "fitness")!.stale).toBe(false);
  });

  it("uses the Paris date for a snapshot taken just before midnight UTC", () => {
    const late: RecoverySnapshot = { ...snapshot, taken_at: "2026-11-08T23:30:00Z" }; // 00:30 on 9 Nov in Paris
    expect(buildKpis([], late, today).find((c) => c.id === "recovery")!.measured).toBe("Updated 00:30");
  });
});
