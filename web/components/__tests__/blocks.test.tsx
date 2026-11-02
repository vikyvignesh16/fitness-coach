// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BigStat } from "../big-stat";
import { ProgressBar } from "../progress-bar";
import { StatusBanner } from "../status-banner";

describe("BigStat", () => {
  it("shows the label, the number and the unit", () => {
    render(<BigStat label="Days to go" value={153} unit="days" />);
    expect(screen.getByText("Days to go")).toBeInTheDocument();
    expect(screen.getByText("153")).toBeInTheDocument();
    expect(screen.getByText("days")).toBeInTheDocument();
  });
});

describe("ProgressBar", () => {
  it("reports its value to screen readers", () => {
    render(<ProgressBar value={4.5} max={32} label="Kilometres this week" />);
    const bar = screen.getByRole("progressbar", { name: "Kilometres this week" });
    expect(bar).toHaveAttribute("aria-valuenow", "4.5");
    expect(bar).toHaveAttribute("aria-valuemax", "32");
  });

  it("stays full and does not overflow when the plan is beaten", () => {
    render(<ProgressBar value={40} max={32} label="km" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "32");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "100%" });
  });

  it("handles a week with nothing planned", () => {
    render(<ProgressBar value={0} max={0} label="km" />);
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "0%" });
  });
});

describe("StatusBanner", () => {
  it("always carries a word as well as colour", () => {
    render(<StatusBanner level="careful" title="Week 2 is locked" />);
    expect(screen.getByRole("status")).toHaveTextContent("Careful: Week 2 is locked");
  });

  it("uses an alert for a stop", () => {
    render(<StatusBanner level="stop" title="Pain stop">See a physio.</StatusBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Stop: Pain stop");
    expect(screen.getByText("See a physio.")).toBeInTheDocument();
  });
});
