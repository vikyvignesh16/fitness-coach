import { ANKLE_CHECKS, evaluateAnkleGate, type AnkleAnswers } from "./gates";

export const ANKLE_GATE_ID = "ankle_return_w2";

/** The approvals row for one ankle check. `passed` is worked out here, never taken from the browser. */
export function buildAnkleGateRecord(answers: AnkleAnswers, planVersionId: string, today: string) {
  const result = evaluateAnkleGate(answers);
  return {
    kind: "gate" as const,
    plan_version_id: planVersionId,
    gate_id: ANKLE_GATE_ID,
    passed: result.passed,
    checks: {
      date: today,
      answers: Object.fromEntries(ANKLE_CHECKS.map((c) => [c.id, answers[c.id]])),
      failed: result.failedChecks,
    },
    note: result.message,
  };
}

/** Read the four yes/no answers from a form. Returns null if any is missing or not yes or no. */
export function parseAnkleAnswers(form: FormData): AnkleAnswers | null {
  const out: Partial<AnkleAnswers> = {};
  for (const c of ANKLE_CHECKS) {
    const v = form.get(c.id);
    if (v !== "yes" && v !== "no") return null;
    out[c.id] = v === "yes";
  }
  return out as AnkleAnswers;
}
