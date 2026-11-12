import { describe, expect, it } from "vitest";
import { tickFor } from "@/components/costs/cost-chart";

describe("axis labels for money", () => {
  it("gives tiny amounts enough decimals that neighbouring ticks differ", () => {
    const tick = tickFor(0.004);
    const labels = [0, 0.001, 0.002, 0.003, 0.004].map(tick);
    expect(new Set(labels).size).toBe(5);
    expect(labels[1]).toBe("$0.0010");
  });
  it("uses cents once amounts reach a few cents", () => {
    expect(tickFor(0.05)(0.04)).toBe("$0.040");
    expect(tickFor(0.5)(0.25)).toBe("$0.25");
  });
  it("drops trailing zeros for whole dollars", () => {
    expect(tickFor(12)(5)).toBe("$5");
    expect(tickFor(12)(2.5)).toBe("$2.5");
    expect(tickFor(12)(0)).toBe("$0");
  });
});
