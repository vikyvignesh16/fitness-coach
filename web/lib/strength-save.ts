import { LIMITS, parseEntries, type ParsedExercise } from "./strength-entry";

// Saving workouts and exercises typed by hand. The checks and the order of steps live here, with the database passed
// in, so they can be tested without one. A row you add is always marked 'manual', and the database refuses to let you
// change a row the watch recorded.

export type NewSet = { session_id: string; position: number; exercise: string; reps: number; weight_kg: number | null };

export type StrengthDb = {
  insertSession(row: { day: string; started_at: string; workout_name: string | null; duration_s: number | null; workout_note: string | null }): Promise<string>;
  maxManualPosition(sessionId: string): Promise<number>;
  insertSets(rows: NewSet[]): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSets(sessionId: string, positions: number[]): Promise<void>;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

const FAILED = "Not saved. Check your signal and try again.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POSITION = 1000; // the database allows positions 1 to 1000
export const EARLIEST_DAY = "2020-01-01";
export const MAX_MINUTES = 600;
export const MAX_NOTE = 5000;

/** Noon in Paris on that date, as a UTC time. A workout typed in by hand has no time of day, so it sorts at noon. */
export function parisNoonUtc(date: string): string {
  const guess = new Date(`${date}T12:00:00Z`);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
    .formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString();
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function readLines(text: string): { ok: true; exercises: ParsedExercise[] } | { ok: false; error: string } {
  const { exercises, errors } = parseEntries(text);
  if (errors.length > 0) return { ok: false, error: `Line ${errors[0].line}: ${errors[0].error}` };
  return { ok: true, exercises };
}

function toRows(sessionId: string, exercises: ParsedExercise[], firstPosition: number): NewSet[] {
  let position = firstPosition;
  return exercises.flatMap((e) => e.sets.map((s) => ({ session_id: sessionId, position: position++, exercise: e.name, reps: s.reps, weight_kg: s.kg })));
}

export type WorkoutInput = { date: string; name: string; minutes: string; note: string; text: string };

/** A whole workout: the session, then its exercises. If the exercises cannot be saved, the empty session is removed again. */
export async function addWorkout(db: StrengthDb, input: WorkoutInput, today: string): Promise<SaveResult> {
  if (!isRealDate(input.date)) return { ok: false, error: "Choose a date." };
  if (input.date > today) return { ok: false, error: "A workout cannot be in the future." };
  if (input.date < EARLIEST_DAY) return { ok: false, error: "That date is too long ago." };
  const name = input.name.trim();
  if (name.length > LIMITS.nameLength) return { ok: false, error: `The name can be at most ${LIMITS.nameLength} letters.` };
  const note = input.note.trim();
  if (note.length > MAX_NOTE) return { ok: false, error: `The note can be at most ${MAX_NOTE} letters.` };
  let durationS: number | null = null;
  if (input.minutes.trim() !== "") {
    const minutes = Number(input.minutes.trim());
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) return { ok: false, error: `Minutes must be a whole number from 1 to ${MAX_MINUTES}.` };
    durationS = minutes * 60;
  }
  const read = readLines(input.text);
  if (!read.ok) return read;

  let sessionId: string;
  try {
    sessionId = await db.insertSession({ day: input.date, started_at: parisNoonUtc(input.date), workout_name: name || null, duration_s: durationS, workout_note: note || null });
  } catch {
    return { ok: false, error: FAILED };
  }
  try {
    await db.insertSets(toRows(sessionId, read.exercises, 1));
  } catch {
    try { await db.deleteSession(sessionId); } catch { /* nothing more to do: the next screen shows what exists */ }
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/** More exercises on a session that already exists, a watch session included. They are added after the ones already added by hand. */
export async function addExercises(db: StrengthDb, input: { sessionId: string; text: string }): Promise<SaveResult> {
  if (!UUID.test(input.sessionId)) return { ok: false, error: "That session was not found." };
  const read = readLines(input.text);
  if (!read.ok) return read;
  try {
    const first = (await db.maxManualPosition(input.sessionId)) + 1;
    const rows = toRows(input.sessionId, read.exercises, first);
    if (rows[rows.length - 1].position > MAX_POSITION) return { ok: false, error: "That would be too many sets for one session." };
    await db.insertSets(rows);
  } catch {
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/** Remove one exercise you added, by the positions of its sets. The database refuses to remove a watch set. */
export async function deleteExercise(db: StrengthDb, sessionId: string, positions: number[]): Promise<SaveResult> {
  if (!UUID.test(sessionId)) return { ok: false, error: "That session was not found." };
  if (positions.length === 0 || positions.length > LIMITS.totalSets || !positions.every((p) => Number.isInteger(p) && p >= 1 && p <= MAX_POSITION)) {
    return { ok: false, error: "That exercise was not found." };
  }
  try {
    await db.deleteSets(sessionId, positions);
  } catch {
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/** Remove a whole workout you added. The database refuses to remove one the watch recorded. */
export async function deleteWorkout(db: StrengthDb, sessionId: string): Promise<SaveResult> {
  if (!UUID.test(sessionId)) return { ok: false, error: "That session was not found." };
  try {
    await db.deleteSession(sessionId);
  } catch {
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}
