// Mirrors coach/safety/health_rules.py (evaluate_ankle_gate and locked_weeks).
// lib/__tests__/gates.test.ts fails if the two lists of checks ever differ.

export const ANKLE_CHECKS = [
  { id: "no_swelling_or_limp", label: "No new swelling, giving way, or limp with normal walking" },
  { id: "calf_raises_20", label: "20 controlled single-leg calf raises on the affected side without worsening pain" },
  { id: "balance_30s", label: "30 seconds single-leg balance on the affected side without giving way or worsening pain" },
  { id: "easy_run_30min", label: "30 minutes easy run or walk with pain 2/10 or less, normal gait, and no worse next morning" },
] as const;

export type AnkleAnswers = Record<(typeof ANKLE_CHECKS)[number]["id"], boolean>;

export type GateResult = { passed: boolean; failedChecks: string[]; message: string };

export function evaluateAnkleGate(answers: Partial<AnkleAnswers>): GateResult {
  const missing = ANKLE_CHECKS.filter((c) => typeof answers[c.id] !== "boolean");
  if (missing.length) {
    throw new Error(`Missing ankle gate checks: ${missing.map((c) => c.id).join(", ")}`);
  }
  const failed = ANKLE_CHECKS.filter((c) => !answers[c.id]).map((c) => c.id);
  if (failed.length) {
    return {
      passed: false,
      failedChecks: failed,
      message:
        "Do not run. Stop impact running and see a sports physio or doctor about swelling, instability or lasting symptoms.",
    };
  }
  return { passed: true, failedChecks: [], message: "All four checks passed. Week 2 is unlocked." };
}

/** Week 2 stays locked until the ankle gate record says passed. */
export function lockedWeeks(ankleGatePassed: boolean): number[] {
  return ankleGatePassed ? [] : [2];
}
