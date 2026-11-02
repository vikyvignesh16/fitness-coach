import { describe, expect, it } from "vitest";
import { daysToRace, formatGoalTime } from "../race";

describe("daysToRace", () => {
  it("counts 153 days from 2 November 2026 to the Paris Marathon", () => {
    expect(daysToRace("2026-11-02", "2027-04-04")).toBe(153);
  });

  it("is 0 on race day and 1 the day before", () => {
    expect(daysToRace("2027-04-04", "2027-04-04")).toBe(0);
    expect(daysToRace("2027-04-03", "2027-04-04")).toBe(1);
  });

  it("goes negative after the race", () => {
    expect(daysToRace("2027-04-05", "2027-04-04")).toBe(-1);
  });

  it("is not thrown off by the clocks changing (28 March 2027)", () => {
    expect(daysToRace("2027-03-27", "2027-03-29")).toBe(2);
  });
});

describe("formatGoalTime", () => {
  it("drops zero seconds", () => {
    expect(formatGoalTime("3:15:00")).toBe("3:15");
    expect(formatGoalTime("3:30:00")).toBe("3:30");
  });

  it("keeps seconds that matter", () => {
    expect(formatGoalTime("3:14:30")).toBe("3:14:30");
  });
});
