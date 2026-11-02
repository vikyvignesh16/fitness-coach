// Mirrors coach/safety/health_rules.py (check_pain). lib/__tests__/pain.test.ts fails if the two ever differ.
// This is not medical advice. A stop always says to be assessed by a professional.

export const PAIN_STOP_SCORE = 3;
export const PAIN_LASTING_HOURS = 24; // the plan says "24 to 48 hours". The cautious end is used.
export const SERIOUS_FLAGS = ["swelling", "giving_way", "gait_change", "cannot_bear_weight"] as const;
export type PainFlag = (typeof SERIOUS_FLAGS)[number];

export const FLAG_LABELS: Record<PainFlag, string> = {
  swelling: "Swelling",
  giving_way: "Ankle giving way",
  gait_change: "Walking or running differently",
  cannot_bear_weight: "Cannot put weight on it",
};

export const ASSESS = "Stop planned progression and quality and long runs, and see a sports physio or clinician before resuming.";

export type PainReport = {
  score: number; // 0 to 10
  repeated: boolean; // pain of 3 or more more than once
  lastedHours: number; // how long pain of 3 or more lasted
  worseNextMorning: boolean;
  flags: string[];
};

export type PainResult = { stop: boolean; message: string | null };

export function evaluatePain(report: PainReport): PainResult {
  const unknown = report.flags.filter((f) => !(SERIOUS_FLAGS as readonly string[]).includes(f));
  if (unknown.length) throw new Error(`Unknown pain flags: ${unknown.sort().join(", ")}`);

  const reasons: string[] = [];
  if (report.score >= PAIN_STOP_SCORE && report.repeated) reasons.push("pain of 3 out of 10 or more, repeatedly");
  if (report.score >= PAIN_STOP_SCORE && report.lastedHours > PAIN_LASTING_HOURS) {
    reasons.push(`pain of 3 or more lasting over ${PAIN_LASTING_HOURS} hours`);
  }
  if (report.worseNextMorning) reasons.push("worse first steps the next morning");
  reasons.push(...[...new Set(report.flags)].sort().map((f) => f.replaceAll("_", " ")));

  if (reasons.length === 0) return { stop: false, message: null };
  let message = `Stop: ${reasons.join(", ")}. ${ASSESS}`;
  if (report.flags.includes("cannot_bear_weight")) {
    message += " Not being able to bear weight needs prompt medical assessment.";
  }
  return { stop: true, message };
}
