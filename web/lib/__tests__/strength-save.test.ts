import { describe, expect, it } from "vitest";
import { addExercises, addWorkout, deleteExercise, deleteWorkout, parisNoonUtc, type NewSet, type StrengthDb } from "../strength-save";
import { localDate } from "../runs";

const ID = "3f2c1b9e-8a41-4d5e-9c7a-0b6e5d4c3a21";
const TODAY = "2026-11-10";

function fakeDb(over: Partial<StrengthDb> = {}) {
  const calls = { sessions: [] as unknown[], sets: [] as NewSet[][], deletedSessions: [] as string[], deletedSets: [] as [string, number[]][] };
  const db: StrengthDb = {
    insertSession: async (row) => { calls.sessions.push(row); return ID; },
    maxManualPosition: async () => 0,
    insertSets: async (rows) => { calls.sets.push(rows); },
    deleteSession: async (id) => { calls.deletedSessions.push(id); },
    deleteSets: async (id, positions) => { calls.deletedSets.push([id, positions]); },
    ...over,
  };
  return { db, calls };
}

const input = { date: "2026-11-09", name: "Push day", minutes: "55", note: "Felt strong", text: "Bench press, 4 x 8 at 40 kg\nPull ups, 3 x 10" };

describe("parisNoonUtc", () => {
  it("is 10:00 UTC in summer and 11:00 UTC in winter", () => {
    expect(parisNoonUtc("2026-07-01")).toBe("2026-07-01T10:00:00.000Z");
    expect(parisNoonUtc("2026-11-09")).toBe("2026-11-09T11:00:00.000Z");
  });

  it("is right across the clock change, and the Paris day stays the date typed", () => {
    expect(parisNoonUtc("2026-10-24")).toBe("2026-10-24T10:00:00.000Z"); // the day before the clocks go back
    expect(parisNoonUtc("2026-10-25")).toBe("2026-10-25T11:00:00.000Z"); // the day they go back
    for (const d of ["2026-03-29", "2026-10-25", "2026-12-31", "2027-01-01"]) expect(localDate(parisNoonUtc(d)), d).toBe(d);
  });
});

describe("addWorkout", () => {
  it("saves the session, then every set in order, marked for this session", async () => {
    const { db, calls } = fakeDb();
    expect(await addWorkout(db, input, TODAY)).toEqual({ ok: true });
    expect(calls.sessions).toEqual([{ day: "2026-11-09", started_at: "2026-11-09T11:00:00.000Z", workout_name: "Push day", duration_s: 3300, workout_note: "Felt strong" }]);
    expect(calls.sets[0]).toHaveLength(7);
    expect(calls.sets[0].map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(calls.sets[0][0]).toEqual({ session_id: ID, position: 1, exercise: "Bench press", reps: 8, weight_kg: 40 });
    expect(calls.sets[0][6]).toEqual({ session_id: ID, position: 7, exercise: "Pull ups", reps: 10, weight_kg: null });
  });

  it("name, minutes and note are optional and saved as empty, not as blanks or zero", async () => {
    const { db, calls } = fakeDb();
    await addWorkout(db, { ...input, name: "  ", minutes: "", note: "" }, TODAY);
    expect(calls.sessions[0]).toMatchObject({ workout_name: null, duration_s: null, workout_note: null });
  });

  it("saves nothing when any check fails", async () => {
    for (const bad of [
      { ...input, date: "" }, { ...input, date: "2026-02-30" }, { ...input, date: "2026-11-11" }, { ...input, date: "2019-12-31" },
      { ...input, minutes: "0" }, { ...input, minutes: "601" }, { ...input, minutes: "1.5" }, { ...input, minutes: "abc" },
      { ...input, name: "a".repeat(121) }, { ...input, note: "a".repeat(5001) }, { ...input, text: "" }, { ...input, text: "nonsense" },
    ]) {
      const { db, calls } = fakeDb();
      const r = await addWorkout(db, bad, TODAY);
      expect(r.ok, JSON.stringify(bad).slice(0, 80)).toBe(false);
      expect(calls.sessions).toEqual([]);
    }
  });

  it("allows today, the earliest day, and the limits exactly", async () => {
    for (const ok of [{ ...input, date: TODAY }, { ...input, date: "2020-01-01" }, { ...input, minutes: "600" }, { ...input, minutes: "1" }, { ...input, name: "a".repeat(120) }, { ...input, note: "a".repeat(5000) }]) {
      expect((await addWorkout(fakeDb().db, ok, TODAY)).ok, JSON.stringify(ok).slice(0, 60)).toBe(true);
    }
  });

  it("points at the line that is wrong", async () => {
    const r = await addWorkout(fakeDb().db, { ...input, text: "Bench press, 4 x 8 at 40\n\nnonsense" }, TODAY);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/^Line 3:/);
  });

  it("removes the empty session again if the sets could not be saved", async () => {
    const { db, calls } = fakeDb({ insertSets: async () => { throw new Error("database says no, with private details"); } });
    const r = await addWorkout(db, input, TODAY);
    expect(r).toEqual({ ok: false, error: "Not saved. Check your signal and try again." });
    expect(calls.deletedSessions).toEqual([ID]);
  });

  it("never shows database text, even when the clean up also fails", async () => {
    const { db } = fakeDb({
      insertSets: async () => { throw new Error("secret detail A"); },
      deleteSession: async () => { throw new Error("secret detail B"); },
    });
    const r = await addWorkout(db, input, TODAY);
    expect(JSON.stringify(r)).not.toMatch(/secret/);
    expect(r.ok).toBe(false);
  });

  it("saves no sets when the session itself could not be saved", async () => {
    const { db, calls } = fakeDb({ insertSession: async () => { throw new Error("no"); } });
    expect((await addWorkout(db, input, TODAY)).ok).toBe(false);
    expect(calls.sets).toEqual([]);
  });
});

describe("addExercises", () => {
  it("numbers the new sets after the ones you already added to that session", async () => {
    const { db, calls } = fakeDb({ maxManualPosition: async () => 5 });
    expect(await addExercises(db, { sessionId: ID, text: "Row, 3 x 10 at 30" })).toEqual({ ok: true });
    expect(calls.sets[0].map((s) => s.position)).toEqual([6, 7, 8]);
    expect(calls.sets[0].every((s) => s.session_id === ID)).toBe(true);
  });

  it("starts at 1 when nothing was added by hand yet", async () => {
    const { db, calls } = fakeDb();
    await addExercises(db, { sessionId: ID, text: "Row, 2 x 10" });
    expect(calls.sets[0].map((s) => s.position)).toEqual([1, 2]);
  });

  it("refuses a bad session id and bad lines without touching the database", async () => {
    const { db, calls } = fakeDb();
    expect((await addExercises(db, { sessionId: "nope", text: "Row, 2 x 10" })).ok).toBe(false);
    expect((await addExercises(db, { sessionId: ID, text: "nonsense" })).ok).toBe(false);
    expect(calls.sets).toEqual([]);
  });

  it("refuses to go past the 1000 sets a session can hold", async () => {
    const { db, calls } = fakeDb({ maxManualPosition: async () => 999 });
    const r = await addExercises(db, { sessionId: ID, text: "Row, 2 x 10" });
    expect(r).toMatchObject({ ok: false });
    expect(calls.sets).toEqual([]);
    expect((await addExercises(fakeDb({ maxManualPosition: async () => 998 }).db, { sessionId: ID, text: "Row, 2 x 10" })).ok).toBe(true);
  });

  it("hides database text on failure", async () => {
    const { db } = fakeDb({ insertSets: async () => { throw new Error("secret detail"); } });
    expect(JSON.stringify(await addExercises(db, { sessionId: ID, text: "Row, 2 x 10" }))).not.toMatch(/secret/);
  });
});

describe("deleting", () => {
  it("removes the sets at those positions", async () => {
    const { db, calls } = fakeDb();
    expect(await deleteExercise(db, ID, [3, 4, 5])).toEqual({ ok: true });
    expect(calls.deletedSets).toEqual([[ID, [3, 4, 5]]]);
  });

  it("refuses nonsense positions and session ids", async () => {
    for (const [id, pos] of [[ID, []], [ID, [0]], [ID, [1001]], [ID, [1.5]], ["nope", [1]], [ID, Array(201).fill(1)]] as [string, number[]][]) {
      const { db, calls } = fakeDb();
      expect((await deleteExercise(db, id, pos)).ok).toBe(false);
      expect(calls.deletedSets).toEqual([]);
    }
  });

  it("removes a whole workout", async () => {
    const { db, calls } = fakeDb();
    expect(await deleteWorkout(db, ID)).toEqual({ ok: true });
    expect(calls.deletedSessions).toEqual([ID]);
    expect((await deleteWorkout(db, "nope")).ok).toBe(false);
  });

  it("hides database text on failure", async () => {
    const boom = { deleteSets: async () => { throw new Error("secret"); }, deleteSession: async () => { throw new Error("secret"); } };
    expect(JSON.stringify(await deleteExercise(fakeDb(boom).db, ID, [1]))).not.toMatch(/secret/);
    expect(JSON.stringify(await deleteWorkout(fakeDb(boom).db, ID))).not.toMatch(/secret/);
  });
});
