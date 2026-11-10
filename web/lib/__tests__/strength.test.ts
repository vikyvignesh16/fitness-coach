import { describe, expect, it } from "vitest";
import { formatSessionTime, sessionsByDay, sessionTotals, summariseSets } from "../strength";
import type { StrengthSession, StrengthSet } from "../types";

const set = (position: number, exercise: string, reps: number | null, weight_kg: number | null, source: "coros" | "manual" = "coros"): StrengthSet =>
  ({ source, position, exercise, reps, weight_kg, seconds: null, avg_hr: null, max_hr: null });

describe("summariseSets", () => {
  const sets = [set(1, "Press", 12, 22), set(2, "Press", 12, 24), set(3, "Press", 13, 24), set(4, "Press", 12, 26), set(5, "Crunch", 15, null), set(6, "Crunch", 15, null)];
  const groups = summariseSets(sets);

  it("keeps every set as its own entry, in the order done, so they are easy to read one by one", () => {
    expect(groups.map((g) => g.exercise)).toEqual(["Press", "Crunch"]);
    expect(groups[0].sets.map((s) => s.short)).toEqual(["12 × 22 kg", "12 × 24 kg", "13 × 24 kg", "12 × 26 kg"]);
    expect(groups[1].sets.map((s) => s.short)).toEqual(["15 reps", "15 reps"]);
  });

  it("does not merge identical sets, because each one is a set you did", () => {
    expect(summariseSets([set(1, "A", 10, 10), set(2, "A", 10, 10)])[0].sets).toHaveLength(2);
  });

  it("gives screen readers the full words with the set number", () => {
    expect(groups[0].sets[2].long).toBe("Set 3: 13 reps at 24 kg");
    expect(groups[1].sets[0].long).toBe("Set 1: 15 reps");
  });

  it("adds up reps times weight, and body weight sets add nothing", () => {
    expect(groups[0].volumeKg).toBe(12 * 22 + 12 * 24 + 13 * 24 + 12 * 26);
    expect(groups[1].volumeKg).toBe(0);
  });

  it("sorts by position, whatever order the sets arrive in", () => {
    expect(summariseSets([set(2, "B", 5, 10), set(1, "A", 5, 10)]).map((g) => g.exercise)).toEqual(["A", "B"]);
  });

  it("the same exercise in two separate blocks stays two blocks", () => {
    expect(summariseSets([set(1, "Curl", 10, 10), set(2, "Row", 10, 20), set(3, "Curl", 8, 12)]).map((g) => g.exercise)).toEqual(["Curl", "Row", "Curl"]);
  });

  it("shows half kilos, and handles a set with no reps or no weight", () => {
    expect(summariseSets([set(1, "Raise", 10, 4.5)])[0].sets[0].short).toBe("10 × 4.5 kg");
    expect(summariseSets([set(1, "Hold", null, 20)])[0].sets[0].short).toBe("20 kg");
    expect(summariseSets([set(1, "Hold", null, null)])[0].sets[0].short).toBe("set");
  });

  it("your own sets come after the watch's, even when they are numbered lower, and stay in their own blocks", () => {
    const mixed = [set(1, "Curl", 10, 12, "manual"), set(2, "Press", 12, 20), set(1, "Press", 12, 20), set(2, "Curl", 10, 12, "manual")];
    const g = summariseSets(mixed);
    expect(g.map((x) => [x.exercise, x.manual])).toEqual([["Press", false], ["Curl", true]]);
    expect(g[0].positions).toEqual([1, 2]);
    expect(g[1].positions).toEqual([1, 2]);
  });

  it("the same exercise from the watch and by hand are two blocks, so only yours can be deleted", () => {
    const g = summariseSets([set(1, "Press", 10, 20), set(1, "Press", 8, 22, "manual")]);
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.manual)).toEqual([false, true]);
  });

  it("a set with zero reps is shown as zero, not hidden", () => {
    expect(summariseSets([set(1, "A", 0, null)])[0].sets[0].short).toBe("0 reps");
  });
});

describe("sessionTotals and time", () => {
  it("counts sets and exercises and adds up the weight lifted", () => {
    expect(sessionTotals([set(1, "A", 10, 10), set(2, "A", 10, 10), set(3, "B", 5, 20)])).toEqual({ sets: 3, exercises: 2, volumeKg: 300 });
  });

  it("formats a session time", () => {
    expect(formatSessionTime(4159)).toBe("1h 09m");
    expect(formatSessionTime(2700)).toBe("45m");
    expect(formatSessionTime(3600)).toBe("1h 00m");
  });
});

describe("sessionsByDay", () => {
  const session = (day: string, started: string): StrengthSession => ({
    id: day + started, source: "coros", coros_id: day + started, started_at: started, day, workout_name: null, duration_s: 100, total_time_s: null, sets_count: null, avg_hr: null,
    calories: null, training_load: null, aerobic_te: null, anaerobic_te: null, training_focus: null, perceived_effort: null, workout_note: null, sets: [],
  });

  it("makes one row per day with a session, in date order", () => {
    const rows = sessionsByDay([session("2026-11-05", "b"), session("2026-11-02", "a")]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-05"]);
  });

  it("two sessions on one day share a row, earliest first", () => {
    const rows = sessionsByDay([session("2026-11-04", "2026-11-04T18:00"), session("2026-11-04", "2026-11-04T09:00")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessions.map((s) => s.started_at)).toEqual(["2026-11-04T09:00", "2026-11-04T18:00"]);
  });

  it("no sessions means no rows", () => {
    expect(sessionsByDay([])).toEqual([]);
  });
});
