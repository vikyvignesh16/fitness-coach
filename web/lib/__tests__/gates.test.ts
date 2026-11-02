import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANKLE_CHECKS, evaluateAnkleGate, lockedWeeks } from "../gates";

const root = path.resolve(__dirname, "../../..");

describe("ankle gate", () => {
  const allYes = Object.fromEntries(ANKLE_CHECKS.map((c) => [c.id, true]));

  it("passes only when all four checks pass", () => {
    expect(evaluateAnkleGate(allYes).passed).toBe(true);
  });

  it("fails and names the failed check", () => {
    const r = evaluateAnkleGate({ ...allYes, balance_30s: false });
    expect(r.passed).toBe(false);
    expect(r.failedChecks).toEqual(["balance_30s"]);
    expect(r.message).toMatch(/physio or doctor/);
  });

  it("refuses to decide when an answer is missing", () => {
    expect(() => evaluateAnkleGate({ no_swelling_or_limp: true })).toThrow(/Missing/);
  });

  it("locks week 2 until the gate has passed", () => {
    expect(lockedWeeks(false)).toEqual([2]);
    expect(lockedWeeks(true)).toEqual([]);
  });
});

describe("drift between TypeScript and Python", () => {
  it("uses the same four check ids as coach/safety/health_rules.py", () => {
    const py = readFileSync(path.join(root, "coach/safety/health_rules.py"), "utf8");
    const block = py.match(/ANKLE_CHECKS = \(([^)]*)\)/)?.[1] ?? "";
    const pyIds = [...block.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(pyIds).toEqual(ANKLE_CHECKS.map((c) => c.id));
  });

  it("has as many checks as the ankle_return_w2 gate in plan v5.1", () => {
    const plan = JSON.parse(
      readFileSync(path.join(root, "data/paris_marathon_2027_v5_1_coros_ready.json"), "utf8"),
    );
    const gate = plan.gates.find((g: { id: string }) => g.id === "ankle_return_w2");
    expect(gate.checks).toHaveLength(ANKLE_CHECKS.length);
  });

  it("uses the same failure message as the Python gate", () => {
    const py = readFileSync(path.join(root, "coach/safety/health_rules.py"), "utf8");
    expect(py).toContain("Do not run. Stop impact running and see a sports physio or doctor");
    expect(evaluateAnkleGate({ ...Object.fromEntries(ANKLE_CHECKS.map((c) => [c.id, true])), calf_raises_20: false }).message)
      .toContain("Do not run. Stop impact running and see a sports physio or doctor");
  });
});
