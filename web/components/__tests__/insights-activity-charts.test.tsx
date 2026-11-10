// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadPerSlotChart, RecoveryChart, RecoveryToday, StressChart } from "../insights/activity-charts";
import { LoadKindFilter } from "../insights/load-kind-filter";
import { parseInsightsRange } from "@/lib/insights-range";
import { loadPerSlotTable, recoveryTable, stressTable } from "@/lib/insights-tables";

class RO { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", RO);

const slot = (label: string, run: number, strength: number, total: number | null, workouts = 1, unscored = 0) => ({ key: label, label, run, strength, total, workouts, unscored });

describe("stress, recovery and load charts", () => {
  it("each one has an accessible description pointing to the table, and its key", () => {
    const { container } = render(
      <>
        <StressChart data={[{ key: "a", label: "9 Nov", stress: 40, baseline: 38, isolated: true }]} />
        <RecoveryChart data={[{ key: "a", label: "9 Nov", last: 80, min: 60, max: 95, band: [60, 95], isolated: true }]} />
        <LoadPerSlotChart data={[slot("9 Nov", 100, 30, 130)]} kind="all" />
      </>,
    );
    const images = container.querySelectorAll('[role="img"]');
    expect(images).toHaveLength(3);
    for (const img of images) expect(img.getAttribute("aria-label")).toMatch(/data table below has the same numbers/i);
    expect(screen.getByText("Average stress")).toBeInTheDocument();
    expect(screen.getByText("Lowest to highest that day")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });

  it("the load chart's key follows the filter: only the kind you chose", () => {
    const { rerender } = render(<LoadPerSlotChart data={[slot("9 Nov", 100, 0, 100)]} kind="run" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Strength")).toBeNull();
    rerender(<LoadPerSlotChart data={[slot("9 Nov", 0, 30, 30)]} kind="strength" />);
    expect(screen.queryByText("Running")).toBeNull();
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });
});

describe("RecoveryToday", () => {
  const point = (label: string, pct: number) => ({ at: label, label, pct, level: "Fresh" });

  it("says so when there is no reading yet", () => {
    render(<RecoveryToday data={[]} />);
    expect(screen.getByText("No recovery reading yet today.")).toBeInTheDocument();
  });

  it("with one reading it says it in words, because one reading draws no line", () => {
    const { container } = render(<RecoveryToday data={[point("08:07", 96)]} />);
    expect(container).toHaveTextContent("Today so far: 96%, Fresh at 08:07");
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("with two or more it draws a chart", () => {
    const { container } = render(<RecoveryToday data={[point("08:07", 96), point("11:07", 94)]} />);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });
});

describe("LoadKindFilter", () => {
  it("marks the chosen kind and keeps the date range and other filters in every link", () => {
    const range = parseInsightsRange({ range: "30", dist: "5-10", load: "run" }, "2026-11-09");
    render(<LoadKindFilter range={range} />);
    expect(screen.getByRole("link", { name: "Running" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Strength" })).toHaveAttribute("href", "/insights?range=30&view=daily&dist=5-10&load=strength");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/insights?range=30&view=daily&dist=5-10");
  });
});

describe("tables", () => {
  it("stress and recovery tables show missing days as empty, not zero", () => {
    expect(stressTable([{ key: "a", label: "a", stress: null, baseline: null, isolated: false }], "daily").rows[0]).toEqual(["a", null, null]);
    expect(recoveryTable([{ key: "a", label: "a", last: null, min: null, max: null, band: null, isolated: false }], "daily").rows[0]).toEqual(["a", null, null, null]);
  });

  it("the load table says no data when workouts have no load figure, and zero when there was no workout", () => {
    const t = loadPerSlotTable([slot("a", 0, 0, null, 2, 2), slot("b", 0, 0, 0, 0, 0), slot("c", 80, 30, 110, 3, 1)], "daily");
    expect(t.rows[0]).toEqual(["a", null, null, null, 2]);
    expect(t.rows[1]).toEqual(["b", 0, 0, 0, 0]);
    expect(t.rows[2]).toEqual(["c", 80, 30, 110, 1]);
  });
});

import { gapFor } from "../insights/chart-parts";

describe("gapFor", () => {
  it("draws the 2px gap between columns when there are few, and none when there are many narrow ones", () => {
    expect(gapFor(7)).toBe(2);
    expect(gapFor(31)).toBe(2);
    expect(gapFor(32)).toBe(0);
    expect(gapFor(90)).toBe(0);
  });
});
