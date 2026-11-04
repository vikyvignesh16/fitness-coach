import { describe, expect, it } from "vitest";
import { diffPlans, notesAdded, runChanged, watchChanged, watchImpact, type DraftPlan } from "../proposal-diff";
import type { PlanDay, PlanRun } from "../types";

const run = (over: Partial<PlanRun> = {}): PlanRun => ({
  type: "easy",
  distance_km: 8,
  duration_min: 47,
  pace_or_effort: "Easy",
  steps: [{ step: "run", distance_km: 8, pace_min_per_km: "5:35–6:15" }],
  ...over,
});
const day = (date: string, r: PlanRun | null, extra: Partial<PlanDay> = {}): PlanDay => ({
  date, week: 1, run: r, gym: null, ...extra,
});
const draft = (...days: { date: string; run: PlanRun | null; coaching_notes?: unknown; gym?: unknown }[]): DraftPlan => ({
  weeks: [{ week: 1, days }],
});

describe("runChanged", () => {
  it("ignores fueling text, which never reaches the watch", () => {
    const a = { ...run(), fueling_hydration: { x: 1 } } as PlanRun;
    const b = { ...run(), fueling_hydration: { x: 2 } } as PlanRun;
    expect(runChanged(a, b)).toBe(false);
  });
  it("also ignores the fueling copy inside the watch block", () => {
    const a = { ...run(), coros_workout: { steps: [1], fueling_hydration: { x: 1 } } } as PlanRun;
    const b = { ...run(), coros_workout: { steps: [1], fueling_hydration: { x: 2 } } } as PlanRun;
    expect(runChanged(a, b)).toBe(false);
  });
  it("sees a changed watch block", () => {
    const a = { ...run(), coros_workout: { rpe: [3, 4] } } as PlanRun;
    const b = { ...run(), coros_workout: { rpe: [7, 9] } } as PlanRun;
    expect(runChanged(a, b)).toBe(true);
  });
});

describe("watchChanged", () => {
  const w = (steps: unknown, name = "n", notes = "x") => ({ ...run({ notes }), coros_workout: { steps, name } }) as PlanRun;
  it("is true for new steps, a new name or new notes", () => {
    expect(watchChanged(w([1]), w([2]))).toBe(true);
    expect(watchChanged(w([1]), w([1], "other"))).toBe(true);
    expect(watchChanged(w([1]), w([1], "n", "other"))).toBe(true);
  });
  it("is false when only other fields differ, or when the keys are in a different order", () => {
    const a = { ...w([{ a: 1, b: 2 }]), distance_km: 8 } as PlanRun;
    const b = { ...w([{ b: 2, a: 1 }]), duration_min: 99 } as PlanRun;
    expect(watchChanged(a, b)).toBe(false);
    expect(runChanged({ ...run() }, JSON.parse('{"steps":[{"pace_min_per_km":"5:35–6:15","distance_km":8,"step":"run"}],"pace_or_effort":"Easy","duration_min":47,"distance_km":8,"type":"easy"}'))).toBe(false);
  });
});

describe("diffPlans", () => {
  it("lists nothing when nothing changed", () => {
    expect(diffPlans([day("2026-11-13", run())], draft({ date: "2026-11-13", run: run() }))).toEqual([]);
  });

  it("says what changed in plain words", () => {
    const out = diffPlans(
      [day("2026-11-13", run())],
      draft({ date: "2026-11-13", run: run({ distance_km: 6, steps: [{ step: "run", distance_km: 6, pace_min_per_km: "5:50–6:25" }] }) }),
    );
    expect(out[0].reasons).toEqual(["Distance: 8 km to 6 km", "Steps or paces changed"]);
    expect(out[0].runChanged).toBe(true);
  });

  it("reports a gym change without calling the run changed", () => {
    const out = diffPlans(
      [day("2026-11-13", run(), { gym: { session: "Legs", key_exercises: [] } })],
      draft({ date: "2026-11-13", run: run(), gym: { session: "Arms", key_exercises: [] } }),
    );
    expect(out).toEqual([{ date: "2026-11-13", week: 1, reasons: ["Gym session changed"], runChanged: false, watchChanged: false }]);
  });

  it("falls back to a general reason when only hidden watch details changed", () => {
    const a = { ...run(), coros_workout: { rpe: [3, 4] } } as PlanRun;
    const b = { ...run(), coros_workout: { rpe: [2, 4] } } as PlanRun;
    const [change] = diffPlans([day("2026-11-13", a)], draft({ date: "2026-11-13", run: b }));
    expect(change.reasons).toEqual(["Small details changed (nothing on the watch)"]);
    expect(change.watchChanged).toBe(false);
  });

  it("sorts by date", () => {
    const out = diffPlans(
      [day("2026-11-14", run()), day("2026-11-13", run())],
      draft({ date: "2026-11-14", run: run({ distance_km: 9 }) }, { date: "2026-11-13", run: run({ distance_km: 9 }) }),
    );
    expect(out.map((c) => c.date)).toEqual(["2026-11-13", "2026-11-14"]);
  });
});

describe("notesAdded", () => {
  it("counts only days that gain a note", () => {
    const now = [day("2026-11-13", run(), { coaching_notes: { before: "x" } }), day("2026-11-14", run())];
    const next = draft(
      { date: "2026-11-13", run: run(), coaching_notes: { before: "y" } },
      { date: "2026-11-14", run: run(), coaching_notes: { before: "z" } },
    );
    expect(notesAdded(now, next)).toBe(1);
  });
});

describe("watchImpact", () => {
  const changes = [
    { date: "2026-11-13", week: 1, reasons: ["x"], runChanged: true, watchChanged: true },
    { date: "2026-11-14", week: 1, reasons: ["x"], runChanged: true, watchChanged: true },
    { date: "2026-11-15", week: 1, reasons: ["Gym session changed"], runChanged: false, watchChanged: false },
    { date: "2026-11-16", week: 1, reasons: ["Small details"], runChanged: true, watchChanged: false },
  ];
  it("separates sent from unsent, and ignores days whose run is the same", () => {
    const out = watchImpact(changes, [
      { subject_date: "2026-11-13", sent_at: "2026-11-05T10:00:00Z" },
      { subject_date: "2026-11-14", sent_at: null },
      { subject_date: "2026-11-15", sent_at: null },
      { subject_date: "2026-11-16", sent_at: "2026-11-05T10:00:00Z" }, // run text changed, but not what the watch got
      { subject_date: "2026-11-20", sent_at: null },
    ]);
    expect(out).toEqual({ alreadySent: ["2026-11-13"], cancelled: ["2026-11-14"] });
  });
  it("leaves a half sent approval alone, because it may already be on the watch", () => {
    const out = watchImpact(changes, [{ subject_date: "2026-11-13", sent_at: null, send_started_at: "2026-11-05T10:00:00Z" }]);
    expect(out).toEqual({ alreadySent: [], cancelled: [] });
  });
});
