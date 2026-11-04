import type { PlanRun, PlanStep, PlanStepPart } from "./types";

/** "2.4" not "2.40", "14" not "14.0". */
function km(n: number): string {
  return `${Number(n.toFixed(2))} km`;
}

/** The size of one piece of a session: "5 min", "20 s" or "0.8 km". Empty if the plan gave none. */
function size(p: { distance_km?: number; duration_min?: number | string; duration_sec?: number }): string {
  if (p.distance_km != null) return km(p.distance_km);
  if (typeof p.duration_min === "number") return `${p.duration_min} min`;
  if (p.duration_sec != null) return `${p.duration_sec} s`;
  return "";
}

/** Pace and effort exactly as the plan wrote them, joined with commas. */
function targets(p: { pace_min_per_km?: string; effort?: string }): string {
  return [p.pace_min_per_km ? `pace ${p.pace_min_per_km} per km` : "", p.effort ?? ""].filter(Boolean).join(", ");
}

function part(label: string, p: PlanStepPart): string {
  const t = targets(p);
  return [label, size(p)].filter(Boolean).join(" ") + (t ? ` (${t})` : "");
}

function line(s: PlanStep): string {
  switch (s.step) {
    case "run": {
      const t = targets(s);
      return `Run ${size(s)}`.trim() + (t ? `, ${t}` : "");
    }
    case "warm_up":
    case "cool_down": {
      const name = s.step === "warm_up" ? "Warm up" : "Cool down";
      const t = targets(s);
      if (typeof s.duration_min === "string") return `${name} ${s.duration_min}` + (t ? `, ${t}` : "");
      if (s.distance_km === 0) return `${name} off the record, no run distance` + (t ? `: ${t}` : "");
      return [name, size(s)].filter(Boolean).join(" ") + (t ? `, ${t}` : "");
    }
    case "repeats": {
      const work = s.work ? part("", s.work).trim() : "";
      const rest = s.recovery ? part("", s.recovery).trim() : "";
      if ((s.repetitions ?? 1) === 1) return `Main set: ${work}` + (rest ? `, then ${rest}` : "");
      return `${s.repetitions} times: ${work}` + (rest ? `, then ${rest}` : "");
    }
    default:
      return `${s.step.replaceAll("_", " ")} ${size(s)}`.trim();
  }
}

/** The steps of a planned run as plain sentences, one per step, as the plan wrote them. Never drops a step. */
export function describeSteps(run: PlanRun | null | undefined): string[] {
  return (run?.steps ?? []).map(line);
}
