// Pure helpers for the gym log. No database here, so everything can be tested on its own.

export type PlannedExercise = {
  name: string;
  sets: number | null;
  reps: string; // text from the plan: "12", "10 each leg", "60 sec", "5 min", "12–15"
  rir: number | null; // reps left in the tank
};

export type LoggedSet = {
  exercise: string;
  set_no: number;
  reps: number | null;
  load_kg: number | null;
  seconds: number | null;
  done: boolean;
};

/** What an input box holds. Strings, because that is what a text box gives us. */
export type SetRow = { setNo: number; reps: string; loadKg: string; seconds: string; done: boolean };

export type RepsSpec =
  | { kind: "reps"; label: string }
  | { kind: "timed"; targetSeconds: number; label: string };

/** "10 each leg" is reps. "60 sec" and "5 min" are timed holds. */
export function parsePlannedReps(text: string): RepsSpec {
  const min = text.match(/(\d+)\s*min/i);
  if (min) return { kind: "timed", targetSeconds: Number(min[1]) * 60, label: text };
  const sec = text.match(/(\d+)\s*sec/i);
  if (sec) return { kind: "timed", targetSeconds: Number(sec[1]), label: text };
  return { kind: "reps", label: text };
}

export type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

function parseNumber(input: string, opts: { max: number; integer: boolean; what: string }): Parsed {
  const text = input.trim().replace(",", "."); // phone keypads often type a comma
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: `${opts.what} must be a number.` };
  const n = Number(text);
  if (opts.integer && !Number.isInteger(n)) return { ok: false, error: `${opts.what} must be a whole number.` };
  if (n > opts.max) return { ok: false, error: `${opts.what} cannot be more than ${opts.max}.` };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export const parseWeight = (s: string) => parseNumber(s, { max: 500, integer: false, what: "Weight" });
export const parseReps = (s: string) => parseNumber(s, { max: 100, integer: true, what: "Reps" });
export const parseSeconds = (s: string) => parseNumber(s, { max: 7200, integer: true, what: "Seconds" });

const fmt = (n: number | null) => (n == null ? "" : String(n));

/** One row per planned set, plus any extra sets already logged, filled with what was saved. */
export function buildSetRows(planned: PlannedExercise, logged: LoggedSet[]): SetRow[] {
  const mine = logged.filter((l) => l.exercise === planned.name);
  const count = Math.max(planned.sets ?? 1, ...mine.map((l) => l.set_no));
  return Array.from({ length: count }, (_, i) => {
    const setNo = i + 1;
    const saved = mine.find((l) => l.set_no === setNo);
    return {
      setNo,
      reps: fmt(saved?.reps ?? null),
      loadKg: fmt(saved?.load_kg ?? null),
      seconds: fmt(saved?.seconds ?? null),
      done: saved?.done ?? false,
    };
  });
}

/** An exercise is done when every planned set is ticked. Extra sets do not matter. */
export function exerciseDone(planned: PlannedExercise, logged: LoggedSet[]): boolean {
  const needed = planned.sets ?? 1;
  const ticked = new Set(logged.filter((l) => l.exercise === planned.name && l.done).map((l) => l.set_no));
  for (let n = 1; n <= needed; n++) if (!ticked.has(n)) return false;
  return true;
}

export function sessionProgress(exercises: PlannedExercise[], logged: LoggedSet[]) {
  return {
    done: exercises.filter((e) => exerciseDone(e, logged)).length,
    total: exercises.length,
  };
}

/** Sets ticked and total weight lifted (reps times kilograms, ticked sets only). */
export function sessionTotals(logged: LoggedSet[]) {
  const ticked = logged.filter((l) => l.done);
  const volumeKg = ticked.reduce((sum, l) => sum + (l.reps != null && l.load_kg != null ? l.reps * l.load_kg : 0), 0);
  return { setsDone: ticked.length, volumeKg: Math.round(volumeKg) };
}

export type HistorySet = { date: string; exercise: string; load_kg: number | null; reps: number | null; done: boolean };

/** The heaviest ticked set from the most recent earlier day this exercise was logged with a weight. */
export function lastPerformance(
  history: HistorySet[],
  exercise: string,
  beforeDate: string,
): { date: string; loadKg: number; reps: number | null } | null {
  const earlier = history.filter(
    (h) => h.exercise === exercise && h.done && h.load_kg != null && h.date < beforeDate,
  );
  if (!earlier.length) return null;
  const lastDate = earlier.map((h) => h.date).sort().at(-1)!;
  const top = earlier.filter((h) => h.date === lastDate).sort((a, b) => b.load_kg! - a.load_kg!)[0];
  return { date: lastDate, loadKg: top.load_kg!, reps: top.reps };
}

export function formatLoad(kg: number): string {
  return `${Number(kg.toFixed(2))} kg`;
}

/** "Plan 4 x 12, 2 reps left" or "Plan 2 x 60 sec". */
export function planLine(e: PlannedExercise): string {
  const base = `Plan ${e.sets ?? 1} x ${e.reps}`;
  return e.rir == null ? base : `${base}, ${e.rir} ${e.rir === 1 ? "rep" : "reps"} left in the tank`;
}
