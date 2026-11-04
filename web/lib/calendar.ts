import { isRestDay } from "./labels";
import { matchRunsToDays } from "./runs";
import type { PlanDay, RunRow } from "./types";
import { addDays, mondayOf } from "./weeks";

export type CalendarCell = {
  date: string;
  inMonth: boolean; // false for the grey days that fill the first and last week
  today: boolean;
  inPlan: boolean; // the plan has a row for this date, so there is a page to open
  plannedKm: number | null; // null on rest days and outside the plan
  runType: string | null;
  doneKm: number | null; // null when nothing was recorded
  gym: boolean;
  locked: boolean; // the week is locked until the ankle check is passed
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A valid "yyyy-mm" from a query string, or the month that contains today. */
export function parseMonth(value: string | string[] | undefined, today: string): string {
  return typeof value === "string" && MONTH.test(value) ? value : today.slice(0, 7);
}

/** The month before or after, as "yyyy-mm". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/**
 * The weeks of a month for a calendar grid, Monday first. Every row has seven days.
 * Runs are matched to days by home time zone, the same way the Plan page does it.
 */
export function buildMonth(
  month: string,
  days: PlanDay[],
  runs: RunRow[],
  today: string,
  locked: number[],
): CalendarCell[][] {
  if (!MONTH.test(month)) throw new Error(`Not a month: ${month}`);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const done = matchRunsToDays(runs);

  const weeks: CalendarCell[][] = [];
  for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const day = byDate.get(date);
        const hasRun = day && !isRestDay(day.run?.type);
        return {
          date,
          inMonth: date.slice(0, 7) === month,
          today: date === today,
          inPlan: Boolean(day),
          plannedKm: hasRun ? day.run!.distance_km : null,
          runType: hasRun ? day.run!.type : null,
          doneKm: done[date] ? done[date].distanceKm : null,
          gym: Boolean(day?.gym?.key_exercises?.length),
          locked: day ? locked.includes(day.week) : false,
        };
      }),
    );
  }
  return weeks;
}
