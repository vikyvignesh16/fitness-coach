// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsWorkCard } from "../insights/needs-work-card";
import type { Flag } from "@/lib/insights-flags";

const f = (id: string, state: Flag["state"], fact = `fact ${id}`): Flag => ({ id, title: id.toUpperCase(), state, fact });

describe("needs work card", () => {
  it("lists flagged facts and mentions checks that could not run", () => {
    render(<NeedsWorkCard flags={[f("hrv", "flag", "HRV was under your COROS normal range on 3 of the last 7 nights."), f("sleep", "ok"), f("rhr", "nodata", "Needs more days.")]} />);
    expect(screen.getByText(/3 of the last 7 nights/)).toBeTruthy();
    expect(screen.getByText(/1 check not run/)).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });

  it("says nothing stands out, and never claims all clear when nothing could run", () => {
    render(<NeedsWorkCard flags={[f("a", "ok")]} />);
    expect(screen.getByText(/Nothing stands out/)).toBeTruthy();
  });

  it("gives no advice words", () => {
    const { container } = render(<NeedsWorkCard flags={[f("a", "flag")]} />);
    expect(container.textContent).not.toMatch(/you should|try to|rest more|take a day off/i);
  });
});
