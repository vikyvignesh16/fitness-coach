import type { StrengthSession, StrengthSet } from "./types";

export type SetLabel = { short: string; long: string }; // "12 × 22 kg" for the tag, "Set 1: 12 reps at 22 kg" for screen readers

export type ExerciseSummary = {
  exercise: string;
  manual: boolean; // typed in by Vicky, not recorded by the watch
  positions: number[]; // the position of each set, so a manual exercise can be deleted precisely
  sets: SetLabel[]; // one for every set, in the order done
  volumeKg: number; // reps times weight, added up. Body weight sets add nothing.
};

const num = (n: number) => String(Math.round(n * 100) / 100);

/** "12 × 22 kg". Body weight is "15 reps". Nothing recorded for reps is just the weight. */
export function setLabel(n: number, reps: number | null, kg: number | null): SetLabel {
  const short = reps === null ? (kg === null ? "set" : `${num(kg)} kg`) : kg === null ? `${reps} reps` : `${reps} × ${num(kg)} kg`;
  const long = reps === null ? (kg === null ? `Set ${n}` : `Set ${n}: ${num(kg)} kg`) : kg === null ? `Set ${n}: ${reps} reps` : `Set ${n}: ${reps} reps at ${num(kg)} kg`;
  return { short, long };
}

/** Watch sets first, then the ones Vicky added, each in the order done. */
const byWhoThenPosition = (a: StrengthSet, b: StrengthSet) =>
  a.source === b.source ? a.position - b.position : a.source === "coros" ? -1 : 1;

/** Group the sets of a session by exercise, in the order done. Every set stays its own entry. */
export function summariseSets(sets: StrengthSet[]): ExerciseSummary[] {
  const out: ExerciseSummary[] = [];
  for (const s of [...sets].sort(byWhoThenPosition)) {
    let block = out[out.length - 1];
    if (!block || block.exercise !== s.exercise || block.manual !== (s.source === "manual")) {
      block = { exercise: s.exercise, manual: s.source === "manual", positions: [], sets: [], volumeKg: 0 };
      out.push(block);
    }
    block.positions.push(s.position);
    block.sets.push(setLabel(block.sets.length + 1, s.reps, s.weight_kg));
    block.volumeKg += (s.reps ?? 0) * (s.weight_kg ?? 0);
  }
  for (const b of out) b.volumeKg = Math.round(b.volumeKg * 10) / 10;
  return out;
}

export type SessionTotals = { sets: number; exercises: number; volumeKg: number };

export function sessionTotals(sets: StrengthSet[]): SessionTotals {
  const groups = summariseSets(sets);
  return { sets: sets.length, exercises: groups.length, volumeKg: Math.round(groups.reduce((a, g) => a + g.volumeKg, 0)) };
}

/** 4159 seconds becomes "1h 09m". Under an hour it is "45m". */
export function formatSessionTime(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

export type GymDayRow = { date: string; sessions: StrengthSession[] };

/** One row for each day that has a recorded session, in date order, earliest session first within a day. */
export function sessionsByDay(sessions: StrengthSession[]): GymDayRow[] {
  const days = new Map<string, StrengthSession[]>();
  for (const s of sessions) days.set(s.day, [...(days.get(s.day) ?? []), s]);
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, sessions: list.sort((a, b) => a.started_at.localeCompare(b.started_at)) }));
}
