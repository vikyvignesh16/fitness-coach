import type { PlanWeek } from "./types";

/** Home time zone. Vicky lives in Paris. Every "which day is it" question uses this one zone. */
export const HOME_TIME_ZONE = "Europe/Paris";

/** Today's date in the home time zone as yyyy-mm-dd. */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The week that contains today. Before the plan starts: the first week. After it ends: the last. */
export function currentWeekNumber(weeks: PlanWeek[], today: string): number {
  const sorted = [...weeks].sort((a, b) => a.week - b.week);
  if (!sorted.length) throw new Error("The plan has no weeks.");
  for (const w of sorted) {
    if (today >= w.start_date && today <= addDays(w.start_date, 6)) return w.week;
  }
  return today < sorted[0].start_date ? sorted[0].week : sorted[sorted.length - 1].week;
}

/** "Mon", "Tue" ... for a yyyy-mm-dd date. */
export function weekdayShort(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** "2 Nov" for a yyyy-mm-dd date. */
export function dayMonth(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** The newest gate record decides. A later fail overrides an earlier pass. */
export function gatePassed(records: { passed: boolean | null; created_at: string }[]): boolean {
  if (!records.length) return false;
  const newest = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return newest.passed === true;
}

/** The Monday of the week that contains this yyyy-mm-dd date. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Remind about the weekly check in from Saturday on, if this week's is not done. Mondays to Fridays stay quiet. */
export function checkinDue(today: string, hasThisWeeksCheckin: boolean): boolean {
  if (hasThisWeeksCheckin) return false;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return dow === 6 || dow === 0;
}
