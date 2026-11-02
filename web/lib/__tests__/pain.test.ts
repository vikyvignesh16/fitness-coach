import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSESS, evaluatePain, PAIN_LASTING_HOURS, PAIN_STOP_SCORE, SERIOUS_FLAGS, type PainReport } from "../pain";

const calm: PainReport = { score: 0, repeated: false, lastedHours: 0, worseNextMorning: false, flags: [] };

describe("evaluatePain", () => {
  it("no pain, no stop", () => {
    expect(evaluatePain(calm)).toEqual({ stop: false, message: null });
  });

  it("pain of 2 never stops on its own, however it behaves", () => {
    expect(evaluatePain({ ...calm, score: 2, repeated: true, lastedHours: 48 }).stop).toBe(false);
  });

  it("pain of 3 or more, repeatedly, stops", () => {
    const r = evaluatePain({ ...calm, score: 3, repeated: true });
    expect(r.stop).toBe(true);
    expect(r.message).toContain("sports physio or clinician");
  });

  it("pain of 3 once, and short, does not stop", () => {
    expect(evaluatePain({ ...calm, score: 3, lastedHours: 10 }).stop).toBe(false);
  });

  it("pain lasting over 24 hours stops, exactly 24 does not", () => {
    expect(evaluatePain({ ...calm, score: 3, lastedHours: 24 }).stop).toBe(false);
    expect(evaluatePain({ ...calm, score: 3, lastedHours: 24.5 }).stop).toBe(true);
  });

  it("worse first steps the next morning stops, whatever the score", () => {
    expect(evaluatePain({ ...calm, score: 1, worseNextMorning: true }).stop).toBe(true);
  });

  it.each(SERIOUS_FLAGS)("the flag %s stops even with no pain score", (flag) => {
    expect(evaluatePain({ ...calm, flags: [flag] }).stop).toBe(true);
  });

  it("not being able to bear weight asks for prompt medical assessment", () => {
    expect(evaluatePain({ ...calm, flags: ["cannot_bear_weight"] }).message).toContain("prompt medical assessment");
    expect(evaluatePain({ ...calm, flags: ["swelling"] }).message).not.toContain("prompt medical");
  });

  it("lists every reason, flags in alphabetical order, each once", () => {
    const r = evaluatePain({ ...calm, score: 5, repeated: true, worseNextMorning: true, flags: ["swelling", "gait_change", "swelling"] });
    expect(r.message).toBe(
      "Stop: pain of 3 out of 10 or more, repeatedly, worse first steps the next morning, gait change, swelling. " + ASSESS,
    );
  });

  it("refuses a flag it does not know instead of ignoring it", () => {
    expect(() => evaluatePain({ ...calm, flags: ["sore_toe"] })).toThrow(/Unknown pain flags/);
  });
});

describe("drift between TypeScript and Python", () => {
  const py = readFileSync(path.resolve(__dirname, "../../../coach/safety/health_rules.py"), "utf8");

  it("uses the same limits as coach/safety/health_rules.py", () => {
    expect(Number(py.match(/^PAIN_STOP_SCORE = (\d+)/m)?.[1])).toBe(PAIN_STOP_SCORE);
    expect(Number(py.match(/^PAIN_LASTING_HOURS = (\d+)/m)?.[1])).toBe(PAIN_LASTING_HOURS);
  });

  it("uses the same serious flags", () => {
    const block = py.match(/SERIOUS_FLAGS = \{([^}]*)\}/)?.[1] ?? "";
    const pyFlags = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect([...SERIOUS_FLAGS].sort()).toEqual(pyFlags);
  });

  it("says the same thing about getting assessed", () => {
    expect(py).toContain(`ASSESS = "${ASSESS}"`);
    expect(py).toContain("Not being able to bear weight needs prompt medical assessment.");
  });

  it("builds its reasons with the same words", () => {
    for (const phrase of ["pain of 3 out of 10 or more, repeatedly", "worse first steps the next morning"]) {
      expect(py).toContain(phrase);
    }
  });
});
