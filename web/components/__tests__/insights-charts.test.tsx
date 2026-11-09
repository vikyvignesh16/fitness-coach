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
