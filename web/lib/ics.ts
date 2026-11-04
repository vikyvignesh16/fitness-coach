import { formatKm } from "./format";
import { lockedWeeks } from "./gates";
import { isRestDay, runLabel } from "./labels";
import type { PlanRun } from "./types";
import { addDays, gatePassed } from "./weeks";
import { describeSteps } from "./workout-steps";

/** What the database function hands over. Notes are left out on purpose: they mention ankle symptoms. */
export type FeedData = {
  version: string;
  days: { date: string; week: number; run: PlanRun }[];
  gates: { passed: boolean | null; created_at: string }[];
};

/** Calendar text rules: escape backslash, semicolon, comma and line breaks. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines may be 75 bytes long. Longer ones continue on the next line after one space. Never splits a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date: string) => date.replaceAll("-", "");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A calendar file with each planned run as an all day event. Locked weeks, rest days and past actuals are left out. */
export function buildIcs(feed: FeedData, now: Date = new Date()): string {
  const locked = lockedWeeks(gatePassed(feed.gates));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Athlete App//Training plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Paris Marathon training",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const d of feed.days) {
    const run = d.run;
    if (!run || isRestDay(run.type) || run.type === "actual" || locked.includes(d.week)) continue;
    const description = [
      run.pace_or_effort ? `Target: ${run.pace_or_effort}` : "",
      run.duration_min ? `About ${run.duration_min} min` : "",
      ...describeSteps(run).map((s, i) => `${i + 1}. ${s}`),
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      // Same id for the same day, so a changed plan updates the event instead of adding a second one.
      `UID:plan-${d.date}@athlete-app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(d.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(d.date, 1))}`,
      `SUMMARY:${escapeText(`${runLabel(run.type)} ${formatKm(run.distance_km)}`)}`,
      `DESCRIPTION:${escapeText(description.join("\n"))}`,
      "TRANSP:TRANSPARENT", // an all day run should not make you look busy
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
