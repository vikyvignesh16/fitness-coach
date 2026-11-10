import { describe, expect, it } from "vitest";
import { buildWorkoutRows, NOTE_PREVIEW, shortNote, type RunForTable } from "../workout-table";
import type { StrengthSession } from "../types";

const run = (id: string, started: string, over: Partial<RunForTable> = {}): RunForTable => ({
  coros_id: id, started_at: started, distance_km: 8, duration_s: 2880, avg_hr: 150, training_load: 90, perceived_effort: "Easy", workout_note: "Felt good", ...over,
});
const session = (id: string, day: string, started: string, over: Partial<StrengthSession> = {}): StrengthSession => ({
  id, source: "coros", coros_id: id, started_at: started, day, workout_name: "Legs Version 1", duration_s: 4159, total_time_s: null, sets_count: null, avg_hr: 110,
  calories: null, training_load: 30, aerobic_te: null, anaerobic_te: null, training_focus: null, perceived_effort: "Easy", workout_note: null,
  sets: [{ source: "coros", position: 1, exercise: "Press", reps: 10, weight_kg: 20, seconds: null, avg_hr: null, max_hr: null }, { source: "coros", position: 2, exercise: "Press", reps: 10, weight_kg: 20, seconds: null, avg_hr: null, max_hr: null }], ...over,
});
const plan = { "2026-11-05": "long_run", "2026-11-06": "no_run" };

describe("shortNote", () => {
  it("keeps a short note whole and says it is not shortened", () => {
    expect(shortNote("Felt good")).toEqual({ text: "Felt good", shortened: false });
  });

  it("takes only the first line, and says there is more", () => {
    expect(shortNote("Felt good.\nLegs heavy at the end.")).toEqual({ text: "Felt good.", shortened: true });
  });

  it("cuts a long first line at 90 letters with an ellipsis", () => {
    const r = shortNote("a".repeat(NOTE_PREVIEW + 20));
    expect(r.text).toBe(`${"a".repeat(NOTE_PREVIEW)}…`);
    expect(r.shortened).toBe(true);
    expect(shortNote("a".repeat(NOTE_PREVIEW)).shortened).toBe(false);
  });

  it("no note, or an empty one, is null", () => {
    expect(shortNote(null).text).toBeNull();
    expect(shortNote("  \n ").text).toBeNull();
  });
});

describe("buildWorkoutRows", () => {
  const runs = [run("r1", "2026-11-05T07:00:00Z"), run("r2", "2026-11-06T07:00:00Z", { training_load: null, perceived_effort: null, workout_note: null })];
  const sessions = [session("s1", "2026-11-04", "2026-11-04T17:00:00Z")];
  const rows = buildWorkoutRows({ runs, sessions, planTypes: plan, show: "all", sort: "date" });

  it("lists runs and gym sessions together, newest first", () => {
    expect(rows.map((r) => r.key)).toEqual(["run-r2", "run-r1", "strength-s1"]);
  });

  it("a run shows distance, time, pace, heart rate, load, effort and note, titled by what the plan called it", () => {
    const r = rows.find((x) => x.key === "run-r1")!;
    expect(r).toMatchObject({ kind: "run", title: "Long run", href: "/runs/r1", hr: 150, load: 90, effort: "Easy", note: "Felt good", manual: false });
    expect([r.size, r.time, r.pace]).toEqual(["8 km", "48:00", "6:00 /km"]);
  });

  it("a rest day or an unplanned day gives a plain 'Run'", () => {
    expect(rows.find((x) => x.key === "run-r2")!.title).toBe("Run");
    expect(buildWorkoutRows({ runs: [run("r3", "2026-11-01T07:00:00Z")], sessions: [], planTypes: plan, show: "all", sort: "date" })[0].title).toBe("Run");
  });

  it("what COROS did not give is null, never zero or blank", () => {
    const r = rows.find((x) => x.key === "run-r2")!;
    expect([r.load, r.effort, r.note]).toEqual([null, null, null]);
  });

  it("a run with no distance has no pace, not a dash", () => {
    expect(buildWorkoutRows({ runs: [run("z", "2026-11-01T07:00:00Z", { distance_km: 0 })], sessions: [], planTypes: {}, show: "all", sort: "date" })[0].pace).toBeNull();
  });

  it("a real zero load is kept as zero", () => {
    expect(buildWorkoutRows({ runs: [run("r4", "2026-11-01T07:00:00Z", { training_load: 0 })], sessions: [], planTypes: {}, show: "all", sort: "date" })[0].load).toBe(0);
  });

  it("a gym session shows its name, sets and weight lifted, time, heart rate and load, and no pace", () => {
    const s = rows.find((x) => x.key === "strength-s1")!;
    expect(s).toMatchObject({ kind: "strength", title: "Legs Version 1", href: "/gym/2026-11-04", size: "2 sets · 400 kg", time: "1h 09m", pace: null, hr: 110, load: 30 });
  });

  it("a gym session with no sets recorded has no size, and a nameless one is called a strength session", () => {
    const s = buildWorkoutRows({ runs: [], sessions: [session("s2", "2026-11-03", "2026-11-03T10:00:00Z", { sets: [], workout_name: null, duration_s: null })], planTypes: {}, show: "all", sort: "date" })[0];
    expect([s.size, s.time, s.title]).toEqual([null, null, "Strength session"]);
  });

  it("marks a workout you typed in", () => {
    const s = buildWorkoutRows({ runs: [], sessions: [session("s3", "2026-11-03", "2026-11-03T10:00:00Z", { source: "manual", coros_id: null })], planTypes: {}, show: "all", sort: "date" })[0];
    expect(s.manual).toBe(true);
  });

  it("two workouts on one day are two rows", () => {
    const two = buildWorkoutRows({ runs: [run("a", "2026-11-05T07:00:00Z")], sessions: [session("b", "2026-11-05", "2026-11-05T17:00:00Z")], planTypes: {}, show: "all", sort: "date" });
    expect(two.map((r) => r.date)).toEqual(["2026-11-05", "2026-11-05"]);
  });

  it("puts a late evening run on its Paris day", () => {
    expect(buildWorkoutRows({ runs: [run("l", "2026-11-05T23:30:00Z")], sessions: [], planTypes: { "2026-11-06": "easy" }, show: "all", sort: "date" })[0]).toMatchObject({ date: "2026-11-06", title: "Easy run" });
  });
});

describe("show and sort", () => {
  const runs = [run("a", "2026-11-01T07:00:00Z", { training_load: 50 }), run("b", "2026-11-02T07:00:00Z", { training_load: null }), run("c", "2026-11-03T07:00:00Z", { training_load: 120 })];
  const sessions = [session("s", "2026-11-04", "2026-11-04T17:00:00Z", { training_load: 80 })];

  it("the filter leaves out the other kind", () => {
    expect(buildWorkoutRows({ runs, sessions, planTypes: {}, show: "run", sort: "date" }).every((r) => r.kind === "run")).toBe(true);
    expect(buildWorkoutRows({ runs, sessions, planTypes: {}, show: "strength", sort: "date" }).map((r) => r.kind)).toEqual(["strength"]);
  });

  it("highest load first puts the workouts with no load figure last, not first", () => {
    const rows = buildWorkoutRows({ runs, sessions, planTypes: {}, show: "all", sort: "load" });
    expect(rows.map((r) => r.load)).toEqual([120, 80, 50, null]);
  });

  it("equal loads keep the newest first", () => {
    const eq = [run("x", "2026-11-01T07:00:00Z", { training_load: 70 }), run("y", "2026-11-02T07:00:00Z", { training_load: 70 })];
    expect(buildWorkoutRows({ runs: eq, sessions: [], planTypes: {}, show: "all", sort: "load" }).map((r) => r.key)).toEqual(["run-y", "run-x"]);
  });
});
