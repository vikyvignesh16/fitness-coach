import type { PlanDay, StrengthSession, StrengthSet } from "./types";
import { addDays } from "./weeks";

export type ExerciseSummary = {
  exercise: string;
  sets: { reps: number | null; kg: number | null }[];
  volumeKg: number; // reps times weight, added up. Body weight sets add nothing.
  lines: string[]; // "2 sets of 12 at 16 kg", repeated sets collapsed
};

const num = (n: number) => String(Math.round(n * 100) / 100);

function lineFor(reps: number | null, kg: number | null, count: number): string {
  const sets = `${count} ${count === 1 ? "set" : "sets"}`;
  const of = reps === null ? "" : ` of ${reps}`;
  return kg === null ? `${sets}${of}` : `${sets}${of} at ${num(kg)} kg`;
}

/** Group the sets of a session by exercise, in the order done. Identical sets in a row become one line. */
export function summariseSets(sets: StrengthSet[]): ExerciseSummary[] {
  const out: ExerciseSummary[] = [];
  for (const s of [...sets].sort((a, b) => a.position - b.position)) {
    let block = out[out.length - 1];
    if (!block || block.exercise !== s.exercise) {
      block = { exercise: s.exercise, sets: [], volumeKg: 0, lines: [] };
      out.push(block);
    }
    block.sets.push({ reps: s.reps, kg: s.weight_kg });
    block.volumeKg += (s.reps ?? 0) * (s.weight_kg ?? 0);
  }
  for (const b of out) {
    const lines: string[] = [];
    let i = 0;
    while (i < b.sets.length) {
      let j = i;
      while (j + 1 < b.sets.length && b.sets[j + 1].reps === b.sets[i].reps && b.sets[j + 1].kg === b.sets[i].kg) j++;
      lines.push(lineFor(b.sets[i].reps, b.sets[i].kg, j - i + 1));
      i = j + 1;
    }
    b.lines = lines;
    b.volumeKg = Math.round(b.volumeKg * 10) / 10;
  }
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

export type GymWeekRow = {
  date: string;
  planned: string | null; // the plan's session name, if the plan had one that day
  sessions: StrengthSession[]; // what the watch recorded that day
};

/** One row for each day of the week that has a planned session or a recorded one, in date order. */
export function gymWeekRows(weekStart: string, planDays: Pick<PlanDay, "date" | "gym">[], sessions: StrengthSession[]): GymWeekRow[] {
  const rows: GymWeekRow[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const plan = planDays.find((d) => d.date === date);
    const planned = plan?.gym?.session && plan.gym.session !== "unverified" && plan.gym.key_exercises?.length ? plan.gym.session : null;
    const done = sessions.filter((s) => s.day === date).sort((a, b) => a.started_at.localeCompare(b.started_at));
    if (planned || done.length) rows.push({ date, planned, sessions: done });
  }
  return rows;
}
