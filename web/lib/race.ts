/** Whole days from today until race day. 0 on race day, negative afterwards. Both are yyyy-mm-dd. */
export function daysToRace(today: string, raceDate: string): number {
  const ms = Date.parse(`${raceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "3:15:00" becomes "3:15". A time with seconds keeps them: "3:14:30" stays. */
export function formatGoalTime(hms: string): string {
  const [h, m, s] = hms.split(":");
  return s && s !== "00" ? `${h}:${m}:${s}` : `${h}:${m}`;
}
