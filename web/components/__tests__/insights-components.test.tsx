// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartCard } from "../insights/chart-card";
import { KpiCard } from "../insights/kpi-card";
import { RangeControls } from "../insights/range-controls";
import type { Kpi } from "@/lib/insights-kpis";
import { parseInsightsRange } from "@/lib/insights-range";

const today = "2026-11-09";
const card = (over: Partial<Kpi> = {}): Kpi => ({
  id: "resting-hr", label: "Resting HR", value: "55", unit: "bpm", lines: ["1 above your 28 day average"], measured: "8 Nov", stale: false, ...over,
});

describe("KpiCard", () => {
  it("shows the value, unit, comparison and when it was measured", () => {
    render(<KpiCard kpi={card()} />);
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("bpm")).toBeInTheDocument();
    expect(screen.getByText("1 above your 28 day average")).toBeInTheDocument();
    expect(screen.getByText("8 Nov")).toBeInTheDocument();
  });

  it("says no data yet, with no number, when there is no value", () => {
    render(<KpiCard kpi={card({ value: null, lines: ["No data yet"], measured: null })} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks an old number as older", () => {
    render(<KpiCard kpi={card({ stale: true })} />);
    expect(screen.getByText("Older: 8 Nov")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  const table = { columns: ["Day", "HRV"], rows: [["8 Nov", 44], ["7 Nov", null]] as (string | number | null)[][] };

  it("shows the chart and the same numbers as a table", () => {
    render(<ChartCard title="HRV" purpose="Am I inside my normal range?" hasData table={table}><div>the chart</div></ChartCard>);
    expect(screen.getByText("the chart")).toBeInTheDocument();
    expect(screen.getByText("Data table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "HRV" })).toBeInTheDocument();
  });

  it("writes a missing value as no data, never as zero", () => {
    render(<ChartCard title="HRV" purpose="p" hasData table={table}><div /></ChartCard>);
    const rows = screen.getAllByRole("row");
    expect(within(rows[2]).getByText("no data")).toBeInTheDocument();
    expect(within(rows[2]).queryByText("0")).toBeNull();
  });

  it("says so when the range has no data", () => {
    render(<ChartCard title="HRV" purpose="p" hasData={false} table={table}><div>the chart</div></ChartCard>);
    expect(screen.getByText("No data in this range.")).toBeInTheDocument();
    expect(screen.queryByText("the chart")).toBeNull();
  });
});

describe("RangeControls", () => {
  it("marks the chosen preset and keeps the view in every link", () => {
    const range = parseInsightsRange({ range: "30", view: "weekly" }, today);
    render(<RangeControls range={range} today={today} />);
    const nav = screen.getByRole("navigation", { name: "Time range" });
    expect(within(nav).getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "90 days" })).toHaveAttribute("href", "/insights?range=90&view=weekly");
    expect(within(screen.getByRole("navigation", { name: "Daily or weekly" })).getByRole("link", { name: "Weekly" })).toHaveAttribute("aria-current", "true");
  });

  it("opens the custom dates and fills them in when a custom range is chosen", () => {
    const range = parseInsightsRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" }, today);
    const { container } = render(<RangeControls range={range} today={today} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(container.querySelector('input[name="from"]')).toHaveValue("2026-10-01");
    expect(container.querySelector('input[name="to"]')).toHaveValue("2026-10-31");
    expect(container.querySelector('input[name="range"]')).toHaveValue("custom");
  });

  it("does not let the date pickers choose a day in the future", () => {
    const { container } = render(<RangeControls range={parseInsightsRange({}, today)} today={today} />);
    for (const name of ["from", "to"]) expect(container.querySelector(`input[name="${name}"]`)).toHaveAttribute("max", today);
  });

  it("explains a fallback", () => {
    const range = parseInsightsRange({ range: "custom", from: "nope", to: "nope" }, today);
    render(<RangeControls range={range} today={today} />);
    expect(screen.getByRole("status")).toHaveTextContent("not valid");
  });
});
