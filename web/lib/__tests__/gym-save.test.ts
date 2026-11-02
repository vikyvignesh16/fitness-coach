import { describe, expect, it } from "vitest";
import { finishWorkout, saveSet, type GymDb, type PlannedGymDay, type SaveSetInput } from "../gym-save";

const DAY: PlannedGymDay = {
  week: 3,
  session: "Chest + triceps",
  exercises: [
    { name: "Flat dumbbell press", sets: 4, reps: "12", rir: 2 },
    { name: "Plank", sets: 2, reps: "60 sec", rir: null },
  ],
};

/** A fake database that remembers what was written. */
function fakeDb(opts: { day?: PlannedGymDay | null; locked?: boolean; failWith?: Error } = {}) {
  const sessions = new Map<string, { id: string; name: string; finished: boolean }>();
  const sets = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const db: GymDb = {
    async getPlannedDay() { calls.push("plan"); return opts.day === undefined ? DAY : opts.day; },
    async isWeekLocked() { calls.push("lock"); return opts.locked ?? false; },
    async upsertSession(date, name) {
      if (opts.failWith) throw opts.failWith;
      const s = sessions.get(date) ?? { id: `s-${date}`, name, finished: false };
      sessions.set(date, s);
      return { id: s.id };
    },
    async upsertSet(row) { sets.set(`${row.session_id}|${row.exercise}|${row.set_no}`, row); },
    async setFinished(date) { sessions.get(date)!.finished = true; },
  };
  return { db, sessions, sets, calls };
}

const input = (o: Partial<SaveSetInput> = {}): SaveSetInput => ({
  date: "2026-11-09", exercise: "Flat dumbbell press", setNo: 1, reps: "12", loadKg: "24", seconds: "", done: true, ...o,
});

describe("saveSet", () => {
  it("saves a set and creates the session with the planned name", async () => {
    const f = fakeDb();
    expect(await saveSet(f.db, input())).toEqual({ ok: true });
    expect(f.sessions.get("2026-11-09")?.name).toBe("Chest + triceps");
    expect([...f.sets.values()][0]).toEqual({
      session_id: "s-2026-11-09", exercise: "Flat dumbbell press", set_no: 1, reps: 12, load_kg: 24, seconds: null, done: true,
    });
  });

  it("accepts a comma decimal weight", async () => {
    const f = fakeDb();
    await saveSet(f.db, input({ loadKg: "22,5" }));
    expect([...f.sets.values()][0].load_kg).toBe(22.5);
  });

  it("stores seconds, not reps or weight, for a timed hold", async () => {
    const f = fakeDb();
    await saveSet(f.db, input({ exercise: "Plank", reps: "99", loadKg: "99", seconds: "60" }));
    expect([...f.sets.values()][0]).toMatchObject({ reps: null, load_kg: null, seconds: 60, done: true });
  });

  it("saving the same set twice leaves one row, with the newest numbers", async () => {
    const f = fakeDb();
    await saveSet(f.db, input({ loadKg: "20" }));
    await saveSet(f.db, input({ loadKg: "24" }));
    expect(f.sets.size).toBe(1);
    expect([...f.sets.values()][0].load_kg).toBe(24);
  });

  it("can save a ticked set with nothing typed, for example a bodyweight move", async () => {
    const f = fakeDb();
    expect(await saveSet(f.db, input({ reps: "", loadKg: "" }))).toEqual({ ok: true });
    expect([...f.sets.values()][0]).toMatchObject({ reps: null, load_kg: null, done: true });
  });

  it("can untick a set", async () => {
    const f = fakeDb();
    await saveSet(f.db, input());
    await saveSet(f.db, input({ done: false }));
    expect([...f.sets.values()][0].done).toBe(false);
  });
});

describe("saveSet refusals write nothing", () => {
  async function refused(f: ReturnType<typeof fakeDb>, i: SaveSetInput, message: RegExp) {
    const r = await saveSet(f.db, i);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(message);
    expect(f.sets.size).toBe(0);
    expect(f.sessions.size).toBe(0);
  }

  it("a locked week", async () => refused(fakeDb({ locked: true }), input(), /locked/));
  it("a day with no gym session in the plan", async () => refused(fakeDb({ day: null }), input(), /No gym session/));
  it("a day whose plan has no exercises", async () =>
    refused(fakeDb({ day: { ...DAY, exercises: [] } }), input(), /No gym session/));
  it("an exercise that is not in the plan", async () =>
    refused(fakeDb(), input({ exercise: "Bench press" }), /not in today's plan/));
  it("a weight over 500 kg", async () => refused(fakeDb(), input({ loadKg: "501" }), /Weight/));
  it("reps that are not a number", async () => refused(fakeDb(), input({ reps: "twelve" }), /Reps/));
  it("reps over 100", async () => refused(fakeDb(), input({ reps: "101" }), /Reps/));
  it("a negative weight", async () => refused(fakeDb(), input({ loadKg: "-5" }), /Weight/));
  it("seconds over two hours on a timed hold", async () =>
    refused(fakeDb(), input({ exercise: "Plank", seconds: "7201" }), /Seconds/));
  it("a badly formed date", async () => refused(fakeDb(), input({ date: "9 Nov" }), /date/));
  it("set number 0", async () => refused(fakeDb(), input({ setNo: 0 }), /Set number/));
  it("set number 21", async () => refused(fakeDb(), input({ setNo: 21 }), /Set number/));
  it("a decimal set number", async () => refused(fakeDb(), input({ setNo: 1.5 }), /Set number/));

  it("checks the lock before anything is written, even with good numbers", async () => {
    const f = fakeDb({ locked: true });
    await saveSet(f.db, input());
    expect(f.calls).toContain("lock");
    expect(f.sessions.size).toBe(0);
  });

  it("does not even look in the database for a badly formed date", async () => {
    const f = fakeDb();
    await saveSet(f.db, input({ date: "'; drop table gym_sets; --" }));
    expect(f.calls).toEqual([]);
  });
});

describe("saveSet when the database fails", () => {
  it("shows a plain message and never the database's own error", async () => {
    const f = fakeDb({ failWith: new Error('relation "gym_sessions" violates constraint secret_name') });
    const r = await saveSet(f.db, input());
    expect(r).toEqual({ ok: false, error: "Could not save. Try again." });
  });
});

describe("finishWorkout", () => {
  it("marks the session finished", async () => {
    const f = fakeDb();
    await saveSet(f.db, input());
    expect(await finishWorkout(f.db, "2026-11-09")).toEqual({ ok: true });
    expect(f.sessions.get("2026-11-09")?.finished).toBe(true);
  });

  it("refuses a locked week", async () => {
    const f = fakeDb({ locked: true });
    const r = await finishWorkout(f.db, "2026-11-09");
    expect(r.ok).toBe(false);
  });

  it("refuses a day with no gym session", async () => {
    expect((await finishWorkout(fakeDb({ day: null }).db, "2026-11-09")).ok).toBe(false);
  });
});
