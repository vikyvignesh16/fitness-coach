import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSetRows, exerciseDone, formatLoad, lastPerformance, parsePlannedReps, parseReps, parseSeconds,
  parseWeight, planLine, sessionProgress, sessionTotals, type LoggedSet, type PlannedExercise,
} from "../gym";

const press: PlannedExercise = { name: "Flat dumbbell press", sets: 4, reps: "12", rir: 2 };
const logged = (set_no: number, o: Partial<LoggedSet> = {}): LoggedSet => ({
  exercise: press.name, set_no, reps: 12, load_kg: 24, seconds: null, done: true, ...o,
});

describe("parsePlannedReps", () => {
  it("treats numbers, ranges and 'each leg' as reps", () => {
    for (const t of ["12", "10 each leg", "12–15", "8 each side"]) expect(parsePlannedReps(t).kind).toBe("reps");
  });

  it("treats seconds and minutes as timed holds", () => {
    expect(parsePlannedReps("60 sec")).toMatchObject({ kind: "timed", targetSeconds: 60 });
    expect(parsePlannedReps("30 sec each foot")).toMatchObject({ kind: "timed", targetSeconds: 30 });
    expect(parsePlannedReps("5 min")).toMatchObject({ kind: "timed", targetSeconds: 300 });
  });

  it("reads every rep format that appears in plan v5.1", () => {
    const plan = JSON.parse(readFileSync(path.resolve(__dirname, "../../../data/paris_marathon_2027_v5_1_coros_ready.json"), "utf8"));
    const formats = new Set<string>();
    for (const w of plan.weeks) for (const d of w.days) for (const e of d.gym.key_exercises) formats.add(e.reps);
    expect(formats.size).toBeGreaterThan(5);
    for (const f of formats) {
      const spec = parsePlannedReps(f);
      expect(["reps", "timed"]).toContain(spec.kind);
      if (spec.kind === "timed") expect(spec.targetSeconds).toBeGreaterThan(0);
    }
  });
});

describe("number boxes", () => {
  it("accepts a comma as the decimal mark", () => {
    expect(parseWeight("22,5")).toEqual({ ok: true, value: 22.5 });
    expect(parseWeight(" 24 ")).toEqual({ ok: true, value: 24 });
  });

  it("treats an empty box as nothing entered", () => {
    expect(parseWeight("")).toEqual({ ok: true, value: null });
    expect(parseReps("  ")).toEqual({ ok: true, value: null });
  });

  it("rejects text, negatives and too many decimals points", () => {
    for (const bad of ["abc", "-5", "12kg", "1.2.3", "1e3"]) expect(parseWeight(bad).ok, bad).toBe(false);
  });

  it("keeps to the limits the database also enforces", () => {
    expect(parseWeight("500").ok).toBe(true);
    expect(parseWeight("500.5").ok).toBe(false);
    expect(parseReps("100").ok).toBe(true);
    expect(parseReps("101").ok).toBe(false);
    expect(parseSeconds("7200").ok).toBe(true);
    expect(parseSeconds("7201").ok).toBe(false);
  });

  it("wants whole numbers for reps and seconds", () => {
    expect(parseReps("10.5").ok).toBe(false);
    expect(parseSeconds("30.5").ok).toBe(false);
  });

  it("rounds a weight to two decimals", () => {
    expect(parseWeight("22.555")).toEqual({ ok: true, value: 22.56 });
  });
});

describe("buildSetRows", () => {
  it("starts with one empty row per planned set", () => {
    const rows = buildSetRows(press, []);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ setNo: 1, reps: "", loadKg: "", seconds: "", done: false });
  });

  it("fills in what was saved and leaves the rest empty", () => {
    const rows = buildSetRows(press, [logged(1), logged(2, { load_kg: 22.5 })]);
    expect(rows[0]).toMatchObject({ reps: "12", loadKg: "24", done: true });
    expect(rows[1].loadKg).toBe("22.5");
    expect(rows[2].done).toBe(false);
  });

  it("keeps extra sets that were added", () => {
    expect(buildSetRows(press, [logged(6)])).toHaveLength(6);
  });

  it("ignores sets that belong to other exercises", () => {
    expect(buildSetRows(press, [logged(1, { exercise: "Leg press" })])[0].done).toBe(false);
  });

  it("gives one row when the plan has no set count", () => {
    expect(buildSetRows({ ...press, sets: null }, [])).toHaveLength(1);
  });
});

describe("progress", () => {
  it("is done only when every planned set is ticked", () => {
    expect(exerciseDone(press, [logged(1), logged(2), logged(3), logged(4)])).toBe(true);
    expect(exerciseDone(press, [logged(1), logged(2), logged(3)])).toBe(false);
    expect(exerciseDone(press, [logged(1), logged(2), logged(3), logged(4, { done: false })])).toBe(false);
  });

  it("does not need extra sets to be ticked", () => {
    expect(exerciseDone(press, [logged(1), logged(2), logged(3), logged(4), logged(5, { done: false })])).toBe(true);
  });

  it("counts finished exercises in a session", () => {
    const row: PlannedExercise = { name: "Row", sets: 1, reps: "10", rir: 2 };
    const all = [logged(1), logged(2), logged(3), logged(4)];
    expect(sessionProgress([press, row], all)).toEqual({ done: 1, total: 2 });
  });

  it("adds up ticked sets and weight lifted", () => {
    const sets = [logged(1), logged(2, { reps: 10, load_kg: 22.5 }), logged(3, { done: false }), logged(4, { load_kg: null })];
    expect(sessionTotals(sets)).toEqual({ setsDone: 3, volumeKg: 12 * 24 + 10 * 22.5 });
  });
});

describe("lastPerformance", () => {
  const h = (date: string, load: number | null, reps = 12, done = true) =>
    ({ date, exercise: "Flat dumbbell press", load_kg: load, reps, done });

  it("returns the heaviest ticked set from the most recent earlier day", () => {
    const history = [h("2026-11-02", 20), h("2026-11-09", 22), h("2026-11-09", 24, 10), h("2026-11-16", 30)];
    expect(lastPerformance(history, "Flat dumbbell press", "2026-11-16")).toEqual({ date: "2026-11-09", loadKg: 24, reps: 10 });
  });

  it("ignores today, the future, unticked sets and sets with no weight", () => {
    const history = [h("2026-11-09", 22, 12, false), h("2026-11-09", null), h("2026-11-16", 30)];
    expect(lastPerformance(history, "Flat dumbbell press", "2026-11-16")).toBeNull();
  });

  it("ignores other exercises", () => {
    expect(lastPerformance([h("2026-11-02", 20)], "Leg press", "2026-11-16")).toBeNull();
  });
});

describe("text for the screen", () => {
  it("formats weights", () => {
    expect(formatLoad(24)).toBe("24 kg");
    expect(formatLoad(22.5)).toBe("22.5 kg");
  });

  it("describes the plan for an exercise", () => {
    expect(planLine(press)).toBe("Plan 4 x 12, 2 reps left in the tank");
    expect(planLine({ ...press, rir: 1 })).toBe("Plan 4 x 12, 1 rep left in the tank");
    expect(planLine({ name: "Hold", sets: 2, reps: "60 sec", rir: null })).toBe("Plan 2 x 60 sec");
  });
});
