// The rules for saving a gym set. The database is passed in, so the tests can use a fake one.
// These checks run on the server, so they hold even if someone skips the screen.
import { parsePlannedReps, parseReps, parseSeconds, parseWeight, type PlannedExercise } from "./gym";

export type PlannedGymDay = { week: number; session: string; exercises: PlannedExercise[] };

/** The few things saving needs from the database. */
export interface GymDb {
  getPlannedDay(date: string): Promise<PlannedGymDay | null>;
  isWeekLocked(week: number): Promise<boolean>;
  upsertSession(date: string, name: string): Promise<{ id: string }>;
  upsertSet(row: {
    session_id: string;
    exercise: string;
    set_no: number;
    reps: number | null;
    load_kg: number | null;
    seconds: number | null;
    done: boolean;
  }): Promise<void>;
  setFinished(date: string): Promise<void>;
}

export type SaveSetInput = {
  date: string; // yyyy-mm-dd
  exercise: string;
  setNo: number;
  reps: string;
  loadKg: string;
  seconds: string;
  done: boolean;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

const LOCKED = "This week is locked until the ankle check is passed.";
const GENERIC = "Could not save. Try again.";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Look up the planned day and check it is allowed. Returns the day, or an error message. */
async function allowedDay(db: GymDb, date: string): Promise<PlannedGymDay | string> {
  if (!isDate(date)) return "That date is not valid.";
  const day = await db.getPlannedDay(date);
  if (!day || day.exercises.length === 0) return "No gym session is planned for that day.";
  if (await db.isWeekLocked(day.week)) return LOCKED;
  return day;
}

export async function saveSet(db: GymDb, input: SaveSetInput): Promise<SaveResult> {
  try {
    if (!Number.isInteger(input.setNo) || input.setNo < 1 || input.setNo > 20) {
      return { ok: false, error: "Set number must be between 1 and 20." };
    }
    const day = await allowedDay(db, input.date);
    if (typeof day === "string") return { ok: false, error: day };

    const planned = day.exercises.find((e) => e.name === input.exercise);
    if (!planned) return { ok: false, error: "That exercise is not in today's plan." };

    const timed = parsePlannedReps(planned.reps).kind === "timed";
    const reps = timed ? { ok: true as const, value: null } : parseReps(input.reps);
    const load = timed ? { ok: true as const, value: null } : parseWeight(input.loadKg);
    const seconds = timed ? parseSeconds(input.seconds) : { ok: true as const, value: null };
    for (const p of [reps, load, seconds]) if (!p.ok) return { ok: false, error: p.error };

    const session = await db.upsertSession(input.date, day.session);
    await db.upsertSet({
      session_id: session.id,
      exercise: input.exercise,
      set_no: input.setNo,
      reps: reps.ok ? reps.value : null,
      load_kg: load.ok ? load.value : null,
      seconds: seconds.ok ? seconds.value : null,
      done: input.done === true,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC }; // never show database errors on screen
  }
}

export async function finishWorkout(db: GymDb, date: string): Promise<SaveResult> {
  try {
    const day = await allowedDay(db, date);
    if (typeof day === "string") return { ok: false, error: day };
    await db.setFinished(date);
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC };
  }
}
