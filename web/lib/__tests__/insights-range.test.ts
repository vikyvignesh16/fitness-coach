import { describe, expect, it } from "vitest";
import { insightsHref, MAX_SPAN_DAYS, parseInsightsRange } from "../insights-range";

const today = "2026-11-09";

describe("parseInsightsRange", () => {
  it("defaults to the last 7 days, today included", () => {
    expect(parseInsightsRange({}, today)).toEqual({
      preset: "7", from: "2026-11-03", to: today, days: 7, view: "daily", dist: "all", notice: null,
    });
  });

  it("reads the 30 and 90 day presets", () => {
    expect(parseInsightsRange({ range: "30" }, today)).toMatchObject({ preset: "30", from: "2026-10-11", days: 30 });
    expect(parseInsightsRange({ range: "90" }, today)).toMatchObject({ preset: "90", from: "2026-08-12", days: 90 });
  });

  it("unknown presets quietly give 7 days", () => {
    expect(parseInsightsRange({ range: "365" }, today)).toMatchObject({ preset: "7", notice: null });
  });

  it("reads a custom range and counts both end days", () => {
    expect(parseInsightsRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" }, today)).toEqual({
      preset: "custom", from: "2026-10-01", to: "2026-10-31", days: 31, view: "daily", dist: "all", notice: null,
    });
  });

  it("never lets the end of a custom range be in the future", () => {
    const r = parseInsightsRange({ range: "custom", from: "2026-11-01", to: "2027-01-01" }, today);
    expect(r.to).toBe(today);
    expect(r.days).toBe(9);
  });

  it("falls back to 7 days with a reason when custom dates are missing, not real, or backwards", () => {
    for (const p of [
      { range: "custom" },
      { range: "custom", from: "2026-13-01", to: "2026-11-01" },
      { range: "custom", from: "2026-02-30", to: "2026-03-05" },
      { range: "custom", from: "yesterday", to: today },
      { range: "custom", from: "2026-11-05", to: "2026-11-01" },
    ]) {
      const r = parseInsightsRange(p, today);
      expect(r, JSON.stringify(p)).toMatchObject({ preset: "7", days: 7 });
      expect(r.notice).toBeTruthy();
    }
  });

  it("allows exactly the maximum span and refuses one day more", () => {
    const to = today;
    const ok = parseInsightsRange({ range: "custom", from: "2026-05-14", to }, today); // 180 days
    expect(ok.days).toBe(MAX_SPAN_DAYS);
    expect(ok.preset).toBe("custom");
    const tooLong = parseInsightsRange({ range: "custom", from: "2026-05-13", to }, today); // 181 days
    expect(tooLong.preset).toBe("7");
    expect(tooLong.notice).toContain("180");
  });

  it("reads the daily or weekly view and defaults to daily", () => {
    expect(parseInsightsRange({ view: "weekly" }, today).view).toBe("weekly");
    expect(parseInsightsRange({ view: "yearly" }, today).view).toBe("daily");
  });

  it("keeps the view when it falls back", () => {
    expect(parseInsightsRange({ range: "custom", view: "weekly" }, today).view).toBe("weekly");
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseInsightsRange({ range: ["30", "90"] }, today).preset).toBe("30");
  });
});

describe("distance filter", () => {
  it("reads 5-10 and 10-16, and anything else means all distances", () => {
    expect(parseInsightsRange({ dist: "5-10" }, today).dist).toBe("5-10");
    expect(parseInsightsRange({ dist: "10-16" }, today).dist).toBe("10-16");
    expect(parseInsightsRange({ dist: "marathon" }, today).dist).toBe("all");
  });

  it("is kept when the range or view changes, and left out when it is all", () => {
    const r = parseInsightsRange({ range: "30", dist: "5-10" }, today);
    expect(insightsHref(r, { preset: "90" })).toBe("/insights?range=90&view=daily&dist=5-10");
    expect(insightsHref(r, { dist: "all" })).toBe("/insights?range=30&view=daily");
  });
});

describe("insightsHref", () => {
  const custom = parseInsightsRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" }, today);

  it("changing the view keeps a custom range", () => {
    expect(insightsHref(custom, { view: "weekly" })).toBe("/insights?range=custom&from=2026-10-01&to=2026-10-31&view=weekly");
  });

  it("choosing a preset drops the custom dates but keeps the view", () => {
    const weekly = parseInsightsRange({ range: "30", view: "weekly" }, today);
    expect(insightsHref(weekly, { preset: "90" })).toBe("/insights?range=90&view=weekly");
  });
});
