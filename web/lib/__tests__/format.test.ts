import { describe, expect, it } from "vitest";
import { formatDuration, formatKm, formatPace } from "../format";

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(2776)).toBe("46:16");
    expect(formatDuration(5086)).toBe("1:24:46");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("formats pace from distance and time", () => {
    expect(formatPace(8.01, 2776)).toBe("5:47 /km");
    expect(formatPace(15.01, 5086)).toBe("5:39 /km");
  });

  it("gives a dash when there is no distance or time", () => {
    expect(formatPace(0, 100)).toBe("-");
    expect(formatPace(5, 0)).toBe("-");
  });

  it("trims km to two decimals without trailing zeros", () => {
    expect(formatKm(8.01)).toBe("8.01 km");
    expect(formatKm(6)).toBe("6 km");
    expect(formatKm(42.195)).toBe("42.2 km");
  });
});
