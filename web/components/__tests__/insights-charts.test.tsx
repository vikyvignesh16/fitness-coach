// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  HrvChart, LoadChart, RestingHrChart, SleepCompositionChart, SleepScoreChart, VolumeChart,
} from "../insights/charts";

class RO { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", RO);

describe("Insights charts", () => {
  it("each one renders with an accessible description that points to the table, and its legend", () => {
    const { container } = render(
      <>
        <SleepCompositionChart data={[{ key: "a", label: "4 Nov", deep: 1, rem: 1, light: 4, awake: 0.5, asleepMin: 360, periodMin: 390, napMin: 0 }]} />
        <SleepScoreChart data={[{ key: "a", label: "4 Nov", score: 80, baseline: 78, low: false, isolated: true }]} />
        <HrvChart data={[{ key: "a", label: "4 Nov", hrv: 60, avg7: null, bandLow: 55, bandHigh: 69, band: [55, 69], status: "Normal", baseline: 62, isolated: true }]} />
        <RestingHrChart data={[{ key: "a", label: "4 Nov", rhr: 55, baseline: 54, isolated: true }]} />
        <LoadChart data={[{ key: "a", label: "4 Nov", short: 60, long: 64, ratio: 0.9, status: "Maintaining", isolated: true }]} />
        <VolumeChart data={[{ weekStart: "2026-11-02", label: "2 Nov", km: 40, runs: 4, changePct: 10, avg4: 35, inProgress: false }]} />
      </>,
    );
    const images = container.querySelectorAll('[role="img"]');
    expect(images).toHaveLength(6);
    for (const img of images) expect(img.getAttribute("aria-label")).toMatch(/data table below has the same numbers/i);
    expect(screen.getByText("Deep")).toBeInTheDocument();
    expect(screen.getByText("Unusually low for you")).toBeInTheDocument();
    expect(screen.getByText("COROS normal range")).toBeInTheDocument();
    expect(screen.getAllByText("Your 28 day average").length).toBe(2);
    expect(screen.getByText("Short-term load")).toBeInTheDocument();
    expect(screen.getByText("4 week average")).toBeInTheDocument();
  });
});

import { EfficiencyChart, LongRunChart, MarathonChart, ThresholdChart, Vo2Chart } from "../insights/fitness-charts";
import { EfficiencyFilter } from "../insights/efficiency-filter";
import { parseInsightsRange } from "@/lib/insights-range";

describe("Fitness charts", () => {
  const fit = [{ key: "a", label: "9 Nov", vo2max: 50, thresholdS: 237, marathonS: 11191, isolated: true }];
  const goals = [{ name: "A" as const, label: "3:15", seconds: 11700 }, { name: "B" as const, label: "3:20", seconds: 12000 }, { name: "C" as const, label: "3:30", seconds: 12600 }];

  it("each one renders with an accessible description that points to the table", () => {
    const { container } = render(
      <>
        <LongRunChart data={[{ weekStart: "2026-11-02", label: "2 Nov", km: 14, durationS: 5100, paceS: 364, avgHr: 150, runsThatWeek: 3 }]} />
        <Vo2Chart data={fit} />
        <ThresholdChart data={fit} />
        <MarathonChart data={fit} goals={goals} />
        <EfficiencyChart today="2026-11-09" data={[
          { id: "1", date: "2026-11-03", label: "3 Nov", km: 8, hr: 150, paceS: 360, group: "this" },
          { id: "2", date: "2026-10-20", label: "20 Oct", km: 12, hr: 148, paceS: 375, group: "last" },
          { id: "3", date: "2026-08-20", label: "20 Aug", km: 9, hr: 152, paceS: 380, group: "earlier" },
        ]} />
      </>,
    );
    const images = container.querySelectorAll('[role="img"]');
    expect(images).toHaveLength(5);
    for (const img of images) expect(img.getAttribute("aria-label")).toMatch(/data table below has the same numbers/i);
  });

  it("the efficiency chart's key names the months and the older runs", () => {
    render(<EfficiencyChart today="2026-11-09" data={[
      { id: "1", date: "2026-11-03", label: "3 Nov", km: 8, hr: 150, paceS: 360, group: "this" },
      { id: "2", date: "2026-10-20", label: "20 Oct", km: 12, hr: 148, paceS: 375, group: "last" },
      { id: "3", date: "2026-08-20", label: "20 Aug", km: 9, hr: 152, paceS: 380, group: "earlier" },
    ]} />);
    expect(screen.getByText("November")).toBeInTheDocument();
    expect(screen.getByText("October")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.queryByText("September")).toBeNull(); // no runs that month, so no key entry
  });

  it("the marathon chart names the goal lines in its key", () => {
    render(<MarathonChart data={fit} goals={goals} />);
    expect(screen.getByText("Your goals")).toBeInTheDocument();
  });
});

describe("EfficiencyFilter", () => {
  it("marks the chosen distance and keeps the date range in every link", () => {
    const range = parseInsightsRange({ range: "30", dist: "5-10" }, "2026-11-09");
    render(<EfficiencyFilter range={range} />);
    expect(screen.getByRole("link", { name: "5 to 10 km" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "10 to 16 km" })).toHaveAttribute("href", "/insights?range=30&view=daily&dist=10-16");
    expect(screen.getByRole("link", { name: "All distances" })).toHaveAttribute("href", "/insights?range=30&view=daily");
  });
});

import { marathonAxis } from "../insights/fitness-charts";

describe("marathonAxis", () => {
  it("covers the prediction and all three goals, with a tick every 10 minutes", () => {
    const goals = [{ name: "A" as const, label: "3:15", seconds: 11700 }, { name: "B" as const, label: "3:20", seconds: 12000 }, { name: "C" as const, label: "3:30", seconds: 12600 }];
    const axis = marathonAxis([{ key: "a", label: "a", vo2max: null, thresholdS: null, marathonS: 11191, isolated: true }], goals);
    expect(axis.domain).toEqual([10800, 13200]); // 3:00:00 to 3:40:00
    expect(axis.ticks).toEqual([10800, 11400, 12000, 12600, 13200]);
    expect(axis.domain[0]).toBeLessThanOrEqual(11191 - 120);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(12600 + 120);
  });

  it("still covers the goals when there is no prediction yet", () => {
    const goals = [{ name: "A" as const, label: "3:15", seconds: 11700 }];
    expect(marathonAxis([], goals).domain).toEqual([11400, 12000]); // 3:10:00 to 3:20:00, around the 3:15 goal
  });
});

describe("marathonAxis padding", () => {
  it("leaves room above the fastest value, so a prediction sitting on a tick is not on the edge", () => {
    const goals = [{ name: "C" as const, label: "3:30", seconds: 12600 }];
    const axis = marathonAxis([{ key: "a", label: "a", vo2max: null, thresholdS: null, marathonS: 12000, isolated: true }], goals);
    expect(axis.domain[0]).toBe(11400); // 12000 is a tick, so the axis starts one tick lower
  });
});
