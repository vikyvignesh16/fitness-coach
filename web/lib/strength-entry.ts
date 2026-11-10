// Reads the exercises you type by hand into sets. One line per exercise:
//   Bench press, 4 x 8 at 40 kg       4 sets of 8 reps at 40 kg
//   Pull ups, 3 x 10                  body weight, so no kg
//   Bench press: 8 at 40, 8 at 40, 6 at 45     each set on its own, for different weights
// Nothing is saved from here. This is only reading and checking, so it can be tested on its own.

export const LIMITS = { sets: 20, reps: 300, kg: 500, nameLength: 120, exercises: 30, totalSets: 200 } as const;

export type EntrySet = { reps: number; kg: number | null }; // kg is null for body weight
export type ParsedExercise = { name: string; sets: EntrySet[] };
export type LineError = { line: number; error: string };

const HINT = "Try: Bench press, 4 x 8 at 40 kg";
const NUMBER = String.raw`\d+(?:\.\d{1,2})?`;

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!/\p{L}/u.test(name) || name.length > LIMITS.nameLength || /[\u0000-\u001f]/.test(name)) return null; // a name needs a letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function weight(text: string | undefined): { ok: true; kg: number | null } | { ok: false; error: string } {
  if (text === undefined) return { ok: true, kg: null };
  const kg = Number(text);
  if (kg > LIMITS.kg) return { ok: false, error: `${kg} kg is more than the ${LIMITS.kg} kg limit.` };
  return { ok: true, kg: kg === 0 ? null : kg }; // 0 kg means body weight
}

function checkReps(reps: number): string | null {
  if (reps < 1) return "Reps must be at least 1.";
  if (reps > LIMITS.reps) return `${reps} reps is more than the ${LIMITS.reps} limit.`;
  return null;
}

/** "4 x 8 at 40 kg", "4x8@40", "4 x 8 x 40" and "4 x 8" (body weight). */
const COUNTED = new RegExp(String.raw`^(\d+)\s*x\s*(\d+)(?:\s*(?:at|@|with|x)?\s*(${NUMBER})\s*(?:kg)?)?$`, "i");
/** One set: "8 at 40 kg", "8@40", or just "10" for body weight. */
const ONE_SET = new RegExp(String.raw`^(\d+)(?:\s*(?:at|@|with)\s*(${NUMBER})\s*(?:kg)?)?$`, "i");

function parseSpec(spec: string): { ok: true; sets: EntrySet[] } | { ok: false; error: string } {
  const counted = spec.match(COUNTED);
  if (counted) {
    const [, n, r, w] = counted;
    const count = Number(n);
    const reps = Number(r);
    if (count < 1) return { ok: false, error: "Sets must be at least 1." };
    if (count > LIMITS.sets) return { ok: false, error: `${count} sets is more than the ${LIMITS.sets} limit.` };
    const repsError = checkReps(reps);
    if (repsError) return { ok: false, error: repsError };
    const kg = weight(w);
    if (!kg.ok) return kg;
    return { ok: true, sets: Array.from({ length: count }, () => ({ reps, kg: kg.kg })) };
  }
  const sets: EntrySet[] = [];
  for (const part of spec.split(/[;,]/)) {
    const one = part.trim().match(ONE_SET);
    if (!one) return { ok: false, error: `I could not read “${part.trim() || spec}”. ${HINT}` };
    const reps = Number(one[1]);
    const repsError = checkReps(reps);
    if (repsError) return { ok: false, error: repsError };
    const kg = weight(one[2]);
    if (!kg.ok) return kg;
    sets.push({ reps, kg: kg.kg });
  }
  if (sets.length > LIMITS.sets) return { ok: false, error: `${sets.length} sets is more than the ${LIMITS.sets} limit.` };
  return { ok: true, sets };
}

/** One line. Returns the exercise, or why the line cannot be read. */
export function parseEntryLine(text: string): { ok: true; exercise: ParsedExercise } | { ok: false; error: string } {
  const line = text.trim().replace(/×/g, "x"); // the patterns below ignore capital letters, so "X" needs no help
  if (/\d,\d/.test(line)) return { ok: false, error: "Use a dot for half kilos, like 22.5, because a comma separates sets." };

  // The name ends at the first comma, colon or semicolon. With none, it ends before the first word that starts with a digit.
  const delimited = line.match(/^([^,:;]+?)\s*[,:;]\s*(.+)$/);
  const spaced = line.match(/^(\D+?)\s+(\d.*)$/);
  const parts = delimited ?? spaced;
  if (!parts) return { ok: false, error: `I could not find the exercise and its sets in “${text.trim()}”. ${HINT}` };

  const name = cleanName(parts[1]);
  if (!name) return { ok: false, error: `The exercise name is empty or longer than ${LIMITS.nameLength} letters.` };
  const spec = parseSpec(parts[2].trim());
  if (!spec.ok) return spec;
  return { ok: true, exercise: { name, sets: spec.sets } };
}

/** All the lines you typed. Blank lines are skipped. Nothing is usable unless every line is fine. */
export function parseEntries(text: string): { exercises: ParsedExercise[]; errors: LineError[] } {
  const exercises: ParsedExercise[] = [];
  const errors: LineError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const result = parseEntryLine(raw);
    if (result.ok) exercises.push(result.exercise);
    else errors.push({ line: i + 1, error: result.error });
  });
  if (exercises.length === 0 && errors.length === 0) errors.push({ line: 1, error: "Type at least one exercise." });
  if (exercises.length > LIMITS.exercises) errors.push({ line: 1, error: `That is more than ${LIMITS.exercises} exercises at once.` });
  if (exercises.reduce((n, e) => n + e.sets.length, 0) > LIMITS.totalSets) errors.push({ line: 1, error: `That is more than ${LIMITS.totalSets} sets at once.` });
  return { exercises, errors };
}
