import { formatDuration, formatKm, formatPace } from "./format";
import type { LoadKind, TableSort } from "./insights-range";
import { runLabel } from "./labels";
import { localDate } from "./runs";
import { formatSessionTime, sessionTotals } from "./strength";
import type { RunRow, StrengthSession } from "./types";

/** A run with the details COROS adds after it (the effort word and your note). */
export type RunForTable = RunRow & { perceived_effort: string | null; workout_note: string | null };

export type WorkoutRow = {
  key: string;
  startedAt: string;
  date: string; // Paris date
  kind: "run" | "strength";
  manual: boolean; // typed in by Vicky, not recorded by the watch
  title: string;
  href: string; // the run page or the gym day
  size: string | null; // "8.0 km", or "32 sets · 1,176 kg"
  time: string | null;
  pace: string | null; // runs only
  hr: number | null;
  load: number | null;
  effort: string | null;
  note: string | null; // the first line, shortened
  noteIsShortened: boolean;
};

export const NOTE_PREVIEW = 90;
export const ROWS_SHOWN = 30;

/** The first line of a note, cut at about 90 letters with an ellipsis. Null when there is no note. */
export function shortNote(text: string | null): { text: string | null; shortened: boolean } {
  const trimmed = text?.trim();
  if (!trimmed) return { text: null, shortened: false };
  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  const cut = firstLine.length > NOTE_PREVIEW ? `${firstLine.slice(0, NOTE_PREVIEW).trimEnd()}…` : firstLine;
  return { text: cut, shortened: cut !== trimmed };
}

const emptyToNull = (s: string | null) => (s && s.trim() ? s.trim() : null);

function runRow(r: RunForTable, planTypes: Record<string, string>): WorkoutRow {
  const date = localDate(r.started_at);
  const type = planTypes[date];
  const note = shortNote(r.workout_note);
  return {
    key: `run-${r.coros_id}`, startedAt: r.started_at, date, kind: "run", manual: false,
    title: type && type !== "no_run" && type !== "not_recorded" ? runLabel(type) : "Run",
    href: `/runs/${r.coros_id}`,
    size: formatKm(r.distance_km), time: formatDuration(r.duration_s), pace: r.distance_km > 0 && r.duration_s > 0 ? formatPace(r.distance_km, r.duration_s) : null,
    hr: r.avg_hr, load: r.training_load ?? null, effort: emptyToNull(r.perceived_effort),
    note: note.text, noteIsShortened: note.shortened,
  };
}

function strengthRow(s: StrengthSession): WorkoutRow {
  const totals = sessionTotals(s.sets);
  const note = shortNote(s.workout_note);
  return {
    key: `strength-${s.id}`, startedAt: s.started_at, date: s.day, kind: "strength", manual: s.source === "manual",
    title: s.workout_name ?? "Strength session", href: `/gym/${s.day}`,
    size: s.sets.length ? `${totals.sets} sets${totals.volumeKg > 0 ? ` · ${totals.volumeKg.toLocaleString("en-GB")} kg` : ""}` : null,
    time: s.duration_s === null ? null : formatSessionTime(s.duration_s), pace: null,
    hr: s.avg_hr, load: s.training_load, effort: emptyToNull(s.perceived_effort),
    note: note.text, noteIsShortened: note.shortened,
  };
}

/** Every run and gym session as one row, filtered and sorted. Anything COROS did not give stays null, never zero. */
export function buildWorkoutRows(input: {
  runs: RunForTable[]; sessions: StrengthSession[]; planTypes: Record<string, string>; show: LoadKind; sort: TableSort;
}): WorkoutRow[] {
  const rows = [
    ...(input.show !== "strength" ? input.runs.map((r) => runRow(r, input.planTypes)) : []),
    ...(input.show !== "run" ? input.sessions.map(strengthRow) : []),
  ];
  const newestFirst = (a: WorkoutRow, b: WorkoutRow) => b.startedAt.localeCompare(a.startedAt);
  if (input.sort === "load") {
    return rows.sort((a, b) => (a.load === null) === (b.load === null) ? (b.load ?? 0) - (a.load ?? 0) || newestFirst(a, b) : a.load === null ? 1 : -1);
  }
  return rows.sort(newestFirst);
}
