import { describe, expect, it } from "vitest";
import { buildAnkleGateRecord, parseAnkleAnswers } from "../gate-record";
import { ANKLE_CHECKS } from "../gates";

const allYes = Object.fromEntries(ANKLE_CHECKS.map((c) => [c.id, true])) as Parameters<typeof buildAnkleGateRecord>[0];

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("buildAnkleGateRecord", () => {
  it("records a pass with each answer and the date", () => {
    const r = buildAnkleGateRecord(allYes, "plan-1", "2026-11-02");
    expect(r).toMatchObject({ kind: "gate", gate_id: "ankle_return_w2", plan_version_id: "plan-1", passed: true });
    expect(r.checks.date).toBe("2026-11-02");
    expect(Object.keys(r.checks.answers)).toEqual(ANKLE_CHECKS.map((c) => c.id));
    expect(r.checks.failed).toEqual([]);
  });

  it("records a fail and names the failed check", () => {
    const r = buildAnkleGateRecord({ ...allYes, calf_raises_20: false }, "plan-1", "2026-11-02");
    expect(r.passed).toBe(false);
    expect(r.checks.failed).toEqual(["calf_raises_20"]);
    expect(r.note).toMatch(/physio or doctor/);
  });
});

describe("parseAnkleAnswers", () => {
  const yes = Object.fromEntries(ANKLE_CHECKS.map((c) => [c.id, "yes"]));

  it("reads four yes and no answers", () => {
    expect(parseAnkleAnswers(form({ ...yes, balance_30s: "no" }))).toEqual({ ...allYes, balance_30s: false });
  });

  it("returns null when an answer is missing", () => {
    const { easy_run_30min, ...rest } = yes;
    void easy_run_30min;
    expect(parseAnkleAnswers(form(rest))).toBeNull();
  });

  it("returns null for anything that is not yes or no, so a pass cannot be forged", () => {
    expect(parseAnkleAnswers(form({ ...yes, balance_30s: "true" }))).toBeNull();
    expect(parseAnkleAnswers(form({ ...yes, balance_30s: "" }))).toBeNull();
  });
});
