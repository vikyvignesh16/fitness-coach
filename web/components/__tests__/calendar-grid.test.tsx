// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarGrid } from "../calendar-grid";
import { buildMonth } from "@/lib/calendar";
import type { PlanDay, RunRow } from "@/lib/types";

const days: PlanDay[] = [
  { date: "2026-11-02", week: 2, run: { type: "recovery", distance_km: 5 }, gym: null },
  { date: "2026-11-03", week: 2, run: { type: "no_run", distance_km: 0 }, gym: null },
  { date: "2026-11-08", week: 2, run: { type: "long_run", distance_km: 14 }, gym: null },
  { date: "2026-11-16", week: 4, run: { type: "easy", distance_km: 6 }, gym: null },
];
const runs: RunRow[] = [
  { coros_id: "a", started_at: "2026-11-02T06:00:00+00:00", distance_km: 5.12, duration_s: 1700, avg_hr: null },
];

function renderMonth(locked: number[]) {
  render(<CalendarGrid weeks={buildMonth("2026-11", days, runs, "2026-11-04", locked)} />);
}

describe("CalendarGrid", () => {
  it("opens the workout page for a planned day, with a spoken label", () => {
    renderMonth([]);
    const link = screen.getByRole("link", { name: /Sun 8 Nov, Long run 14 km planned/ });
    expect(link.getAttribute("href")).toBe("/plan/2026-11-08");
  });

  it("shows planned and done distance on a day that was run", () => {
    renderMonth([]);
    const link = screen.getByRole("link", { name: /Mon 2 Nov, Recovery run 5 km planned, 5.12 km done/ });
    expect(link.textContent).toContain("5");
    expect(link.textContent).toContain("5.1");
  });

  it("does not link days the plan has no row for", () => {
    renderMonth([]);
    expect(screen.queryByRole("link", { name: /Fri 20 Nov/ })).toBeNull();
  });

  it("marks a rest day as rest and still links it", () => {
    renderMonth([]);
    expect(screen.getByRole("link", { name: /Tue 3 Nov, rest from running/ })).toBeTruthy();
  });

  it("hides the workout on a locked week and says why", () => {
    renderMonth([2]);
    const link = screen.getByRole("link", { name: /Sun 8 Nov, locked until the ankle check is passed/ });
    expect(link.textContent).not.toContain("14");
    // Week 4 is not locked, so it still shows.
    expect(screen.getByRole("link", { name: /Mon 16 Nov, Easy run 6 km planned/ })).toBeTruthy();
  });

  it("marks today", () => {
    renderMonth([]);
    const today = document.querySelector('[aria-current="date"]');
    expect(today?.getAttribute("aria-label")).toMatch(/Wed 4 Nov/);
  });
});
