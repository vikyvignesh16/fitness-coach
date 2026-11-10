import { describe, expect, it } from "vitest";
import { formatSessionTime, gymWeekRows, sessionTotals, summariseSets } from "../strength";
import type { StrengthSession, StrengthSet } from "../types";

const set = (position: number, exercise: string, reps: number | null, weight_kg: number | null): StrengthSet =>
  ({ position, exercise, reps, weight_kg, seconds: null, avg_hr: null, max_hr: null });

describe("summariseSets", () => {
  const sets = [set(1, "Press", 12, 16), set(2, "Press", 12, 16), set(3, "Press", 12, 18), set(4, "Crunch", 15, null), set(5, "Crunch", 15, null)];
  const groups = summariseSets(sets);

  it("groups by exercise in the order done and collapses identical sets", () => {
    expect(groups.map((g) => g.exercise)).toEqual(["Press", "Crunch"]);
    expect(groups[0].lines).toEqual(["2 sets of 12 at 16 kg", "1 set of 12 at 18 kg"]);
    expect(groups[1].lines).toEqual(["2 sets of 15"]);
  });

  it("adds up reps times weight, and body weight sets add nothing", () => {
    expect(groups[0].volumeKg).toBe(12 * 16 * 2 + 12 * 18);
    expect(groups[1].volumeKg).toBe(0);
  });

  it("sorts by position, whatever order the sets arrive in", () => {
    expect(summariseSets([set(2, "B", 5, 10), set(1, "A", 5, 10)]).map((g) => g.exercise)).toEqual(["A", "B"]);
  });

  it("the same exercise in two separate blocks stays two blocks", () => {
    expect(summariseSets([set(1, "Curl", 10, 10), set(2, "Row", 10, 20), set(3, "Curl", 8, 12)]).map((g) => g.exercise)).toEqual(["Curl", "Row", "Curl"]);
  });

  it("shows half kilos and leaves out the reps when COROS had none", () => {
    expect(summariseSets([set(1, "Raise", 10, 4.5)])[0].lines).toEqual(["1 set of 10 at 4.5 kg"]);
    expect(summariseSets([set(1, "Hold", null, null)])[0].lines).toEqual(["1 set"]);
  });

  it("a different weight breaks a run of identical sets", () => {
    expect(summariseSets([set(1, "A", 10, 10), set(2, "A", 10, 12), set(3, "A", 10, 10)])[0].lines).toHaveLength(3);
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

describe("gymWeekRows", () => {
  const session = (day: string, started: string): StrengthSession => ({
    id: day + started, coros_id: day + started, started_at: started, day, workout_name: null, duration_s: 100, total_time_s: null, sets_count: null, avg_hr: null,
    calories: null, training_load: null, aerobic_te: null, anaerobic_te: null, training_focus: null, perceived_effort: null, workout_note: null, sets: [],
  });
  const plan = [
    { date: "2026-11-02", gym: { session: "Legs + ankle/calf", key_exercises: [{ name: "x", sets: 3, reps: "10", rir: null }] } },
    { date: "2026-11-03", gym: { session: "unverified", key_exercises: [] } },
    { date: "2026-11-04", gym: { session: "Mobility", key_exercises: [] } },
  ] as never;

  it("shows planned days, days with a recorded session, and days with both, in date order", () => {
    const rows = gymWeekRows("2026-11-02", plan, [session("2026-11-02", "a"), session("2026-11-05", "b")]);
    expect(rows.map((r) => [r.date, r.planned, r.sessions.length])).toEqual([["2026-11-02", "Legs + ankle/calf", 1], ["2026-11-05", null, 1]]);
  });

  it("a planned day nobody did still shows, as planned with no sessions", () => {
    expect(gymWeekRows("2026-11-02", plan, [])).toEqual([{ date: "2026-11-02", planned: "Legs + ankle/calf", sessions: [] }]);
  });

  it("a day the plan marks unverified is not a planned session, even if it lists exercises", () => {
    const odd = [{ date: "2026-11-02", gym: { session: "unverified", key_exercises: [{ name: "x", sets: 1, reps: "5", rir: null }] } }] as never;
    expect(gymWeekRows("2026-11-02", odd, [])).toEqual([]);
  });

  it("two sessions on one day both show, earliest first", () => {
    const rows = gymWeekRows("2026-11-02", [] as never, [session("2026-11-04", "2026-11-04T18:00"), session("2026-11-04", "2026-11-04T09:00")]);
    expect(rows[0].sessions.map((s) => s.started_at)).toEqual(["2026-11-04T09:00", "2026-11-04T18:00"]);
  });

  it("ignores sessions outside the week", () => {
    expect(gymWeekRows("2026-11-02", [] as never, [session("2026-11-09", "a")])).toEqual([]);
  });
});
