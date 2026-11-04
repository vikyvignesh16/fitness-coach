import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, type FeedData } from "../ics";

const NOW = new Date("2026-11-04T10:00:00Z");
const feed = (over: Partial<FeedData> = {}): FeedData => ({
  version: "5.1",
  days: [
    { date: "2026-11-02", week: 2, run: { type: "recovery", distance_km: 5, pace_or_effort: "RPE 2–4/10", steps: [{ step: "run", distance_km: 5, pace_min_per_km: "5:50–6:25" }] } },
    { date: "2026-11-03", week: 2, run: { type: "no_run", distance_km: 0 } },
    { date: "2026-11-08", week: 2, run: { type: "long_run", distance_km: 14, duration_min: 84 } },
    { date: "2026-11-16", week: 4, run: { type: "easy", distance_km: 6 } },
  ],
  gates: [{ passed: true, created_at: "2026-11-02T19:00:00Z" }],
  ...over,
});
const events = (ics: string) => ics.split("BEGIN:VEVENT").slice(1);

describe("buildIcs", () => {
  it("uses calendar line endings and the required wrapper", () => {
    const ics = buildIcs(feed(), NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes one all day event per planned run, skipping rest days", () => {
    const ev = events(buildIcs(feed(), NOW));
    expect(ev).toHaveLength(3);
    const long = ev.find((e) => e.includes("DTSTART;VALUE=DATE:20261108"))!;
    expect(long).toContain("DTEND;VALUE=DATE:20261109");
    expect(long).toContain("SUMMARY:Long run 14 km");
    expect(long).toContain("UID:plan-2026-11-08@athlete-app");
    expect(long).toContain("TRANSP:TRANSPARENT");
  });

  it("puts the target and the steps in the description", () => {
    const first = events(buildIcs(feed(), NOW))[0];
    expect(first).toContain("DESCRIPTION:Target: RPE 2–4/10\\n1. Run 5 km\\, pace 5:50–6:25 per km");
  });

  it("leaves out a locked week until the ankle check is passed, and shows it after", () => {
    const failed = feed({ gates: [{ passed: false, created_at: "2026-11-02T19:00:00Z" }] });
    expect(buildIcs(failed, NOW)).not.toContain("20261108");
    expect(buildIcs(failed, NOW)).toContain("20261116"); // week 4 is not locked
    expect(buildIcs(feed({ gates: [] }), NOW)).not.toContain("20261102");
    expect(buildIcs(feed(), NOW)).toContain("20261108");
  });

  it("never includes plan notes, even if the data carried them", () => {
    const data = feed();
    (data.days[0].run as { notes?: string }).notes = "ankle flare, reduce or stop";
    expect(buildIcs(data, NOW)).not.toMatch(/ankle|flare/);
  });

  it("skips the recorded past run and gives an empty calendar for an empty plan", () => {
    const past = feed({ days: [{ date: "2026-10-28", week: 1, run: { type: "actual", distance_km: 8.01 } }] });
    expect(events(buildIcs(past, NOW))).toHaveLength(0);
    expect(events(buildIcs(feed({ days: [] }), NOW))).toHaveLength(0);
  });

  it("keeps every line within 75 bytes", () => {
    const long = feed({ days: [{ date: "2026-11-08", week: 2, run: { type: "long_run", distance_km: 14, pace_or_effort: "RPE 2–4/10; ".repeat(30) } }] });
    for (const l of buildIcs(long, NOW).split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});

describe("escapeText and foldLine", () => {
  it("escapes the characters that break a calendar file", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("does not split a multi byte character and unfolds back to the original", () => {
    const original = "DESCRIPTION:" + "–".repeat(60); // en dash is 3 bytes
    const folded = foldLine(original);
    expect(folded).toContain("\r\n ");
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replaceAll("\r\n ", "")).toBe(original);
  });

  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Easy run 6 km")).toBe("SUMMARY:Easy run 6 km");
  });
});
