// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkoutHistory } from "../insights/workout-history";
import { parseInsightsRange } from "@/lib/insights-range";
import type { WorkoutRow } from "@/lib/workout-table";

const row = (over: Partial<WorkoutRow> = {}): WorkoutRow => ({
  key: "run-1", startedAt: "2026-11-05T07:00:00Z", date: "2026-11-05", kind: "run", manual: false, title: "Long run", href: "/runs/1", size: "14 km", time: "1:24:53",
  pace: "6:04 /km", hr: 160, load: 242, effort: "Very Easy", note: "Felt fine", noteIsShortened: false, ...over,
});
const range = (p: Record<string, string> = {}) => parseInsightsRange({ range: "30", ...p }, "2026-11-10");

describe("WorkoutHistory", () => {
  it("shows a table for laptops and cards for phones, both linking to the workout", () => {
    const { container } = render(<WorkoutHistory rows={[row()]} range={range()} total={1} />);
    const table = container.querySelector("table")!;
    expect(within(table).getByRole("link", { name: "Long run" })).toHaveAttribute("href", "/runs/1");
    const cards = container.querySelector("ul.md\\:hidden")!;
    expect(within(cards as HTMLElement).getByRole("link")).toHaveAttribute("href", "/runs/1");
    expect(within(table).getByText("242")).toBeInTheDocument();
    expect(within(table).getByText("Felt fine")).toBeInTheDocument();
  });

  it("missing values say no data, never zero, and a gym session has no pace", () => {
    const gym = row({ key: "s", kind: "strength", title: "Legs", href: "/gym/2026-11-05", size: null, time: null, pace: null, hr: null, load: null, effort: null, note: null });
    const { container } = render(<WorkoutHistory rows={[gym]} range={range()} total={1} />);
    const table = container.querySelector("table")!;
    expect(within(table).getAllByText("no data")).toHaveLength(6); // everything except pace, which a gym session never has
    expect(within(table).queryByText("0")).toBeNull();
  });

  it("a real zero load is shown as zero", () => {
    const { container } = render(<WorkoutHistory rows={[row({ load: 0 })]} range={range()} total={1} />);
    expect(within(container.querySelector("table")!).getByText("0")).toBeInTheDocument();
  });

  it("marks a workout you typed in", () => {
    const { container } = render(<WorkoutHistory rows={[row({ manual: true, kind: "strength", title: "Push day", pace: null })]} range={range()} total={1} />);
    expect(within(container.querySelector("table")!).getByText("Added by you")).toBeInTheDocument();
  });

  it("says so when there are no workouts in the range", () => {
    render(<WorkoutHistory rows={[]} range={range()} total={0} />);
    expect(screen.getByText("No workouts in this range.")).toBeInTheDocument();
  });

  it("the type and sort controls mark the choice and keep the date range", () => {
    render(<WorkoutHistory rows={[row()]} range={range({ show: "run", sort: "load" })} total={1} />);
    const type = screen.getByRole("navigation", { name: "Workout type" });
    expect(within(type).getByRole("link", { name: "Running" })).toHaveAttribute("aria-current", "true");
    expect(within(type).getByRole("link", { name: "Strength" })).toHaveAttribute("href", "/insights?range=30&view=daily&show=strength&sort=load");
    const sort = screen.getByRole("navigation", { name: "Sort workouts" });
    expect(within(sort).getByRole("link", { name: "Highest load first" })).toHaveAttribute("aria-current", "true");
    expect(within(sort).getByRole("link", { name: "Newest first" })).toHaveAttribute("href", "/insights?range=30&view=daily&show=run");
  });

  it("offers to show all when there are more than the newest few, and to go back", () => {
    const { rerender } = render(<WorkoutHistory rows={[row()]} range={range()} total={52} />);
    expect(screen.getByText("Showing 1 of 52 workouts.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all 52" })).toHaveAttribute("href", "/insights?range=30&view=daily&rows=all");
    rerender(<WorkoutHistory rows={[row()]} range={range({ rows: "all" })} total={52} />);
    expect(screen.getByRole("link", { name: "Show only the newest 30" })).toHaveAttribute("href", "/insights?range=30&view=daily");
  });

  it("offers nothing extra when everything is already shown", () => {
    render(<WorkoutHistory rows={[row()]} range={range()} total={1} />);
    expect(screen.queryByRole("link", { name: /Show all|Show only/ })).toBeNull();
    expect(screen.getByText("Showing 1 of 1 workout.")).toBeInTheDocument();
  });

  it("changing the type goes back to the newest rows", () => {
    render(<WorkoutHistory rows={[row()]} range={range({ rows: "all" })} total={1} />);
    const type = screen.getByRole("navigation", { name: "Workout type" });
    expect(within(type).getByRole("link", { name: "Strength" }).getAttribute("href")).not.toContain("rows=all");
  });
});
