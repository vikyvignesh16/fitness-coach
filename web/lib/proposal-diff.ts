// Compares a draft plan with the plan in use, day by day. Pure functions, no database.
// A day counts as changed when its run differs, ignoring the fueling text, because the fueling text never reaches
// the watch. watchChanged is the narrower rule for what the watch job actually sends; the database function
// adopt_plan_proposal uses the same two fields to decide which unsent approvals to cancel.
import type { PlanDay, PlanRun } from "./types";
import { describeSteps } from "./workout-steps";

/** The part of a draft the page needs. The full plan JSON has more. */
export type DraftDay = { date: string; run: PlanRun | null; gym?: unknown; nutrition?: unknown; coaching_notes?: unknown };
export type DraftPlan = { weeks: { week: number; days: DraftDay[] }[] };

export type DayChange = {
  date: string;
  week: number;
  reasons: string[];
  runChanged: boolean;
  /** The workout that would reach the watch is different (its steps, name or notes). */
  watchChanged: boolean;
};
export type Approval = { subject_date: string; sent_at: string | null; send_started_at?: string | null };

const without = (run: PlanRun | null | undefined) => {
  if (!run) return null;
  const copy: Record<string, unknown> = { ...run };
  delete copy.fueling_hydration;
  const watch = copy.coros_workout;
  if (watch && typeof watch === "object") {
    const inner: Record<string, unknown> = { ...(watch as Record<string, unknown>) };
    delete inner.fueling_hydration; // the watch block carries its own copy of the fueling text
    copy.coros_workout = inner;
  }
  return copy;
};
/** JSON text with keys in a fixed order, so two plans with the same content always compare equal. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
const same = (a: unknown, b: unknown) => canon(a ?? null) === canon(b ?? null);
const km = (n: number | undefined) => `${Number((n ?? 0).toFixed(2))} km`;

/** True when the watch workout for that day would be different. */
export function runChanged(before: PlanRun | null | undefined, after: PlanRun | null | undefined): boolean {
  return !same(without(before), without(after));
}

type WatchRun = PlanRun & { coros_workout?: { steps?: unknown; name?: string } | null };

/**
 * True when what the watch job sends would differ. That is the workout steps and its name
 * (see ingest/watch_course.to_course; the run notes are not sent). The database function adopt_plan_proposal
 * uses the same two fields.
 */
export function watchChanged(before: PlanRun | null | undefined, after: PlanRun | null | undefined): boolean {
  const pick = (r: PlanRun | null | undefined) => {
    const w = r as WatchRun | null | undefined;
    return [w?.coros_workout?.steps ?? null, w?.coros_workout?.name ?? null];
  };
  return !same(pick(before), pick(after));
}

function reasonsFor(before: PlanRun | null, after: PlanRun | null): string[] {
  if (!before || !after) return ["Run added or removed"];
  const out: string[] = [];
  if (before.type !== after.type) out.push(`Type: ${before.type} to ${after.type}`);
  if (before.distance_km !== after.distance_km) out.push(`Distance: ${km(before.distance_km)} to ${km(after.distance_km)}`);
  if (before.duration_min !== after.duration_min) out.push(`Time: ${before.duration_min ?? "none"} to ${after.duration_min ?? "none"} min`);
  if ((before.pace_or_effort ?? "") !== (after.pace_or_effort ?? "")) out.push("Target text changed");
  if (!same(describeSteps(before), describeSteps(after))) out.push("Steps or paces changed");
  if ((before.notes ?? "") !== (after.notes ?? "")) out.push("Notes changed");
  return out.length ? out : ["Small details changed (nothing on the watch)"];
}

/** Days whose run, gym or food targets differ. Days missing from the current plan count as changed. */
export function diffPlans(current: PlanDay[], draft: DraftPlan): DayChange[] {
  const now = new Map(current.map((d) => [d.date, d]));
  const out: DayChange[] = [];
  for (const w of draft.weeks) {
    for (const d of w.days) {
      const old = now.get(d.date);
      const changed = runChanged(old?.run, d.run);
      const reasons = changed ? reasonsFor(old?.run ?? null, d.run) : [];
      if (!same(old?.gym, d.gym)) reasons.push("Gym session changed");
      if (!same((old as { nutrition?: unknown } | undefined)?.nutrition, d.nutrition)) reasons.push("Food targets changed");
      if (reasons.length) {
        out.push({ date: d.date, week: w.week, reasons, runChanged: changed, watchChanged: watchChanged(old?.run, d.run) });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Days with a coaching note in the draft that the current plan lacks. */
export function notesAdded(current: PlanDay[], draft: DraftPlan): number {
  const now = new Map(current.map((d) => [d.date, d]));
  return draft.weeks.flatMap((w) => w.days).filter((d) => d.coaching_notes && !now.get(d.date)?.coaching_notes).length;
}

/**
 * What the switch does to watch approvals, for days whose watch workout changed:
 *  - alreadySent: on the COROS calendar already. COROS has no delete, so Vicky removes these by hand.
 *  - cancelled: approved but never sent. These are cancelled so she approves the new workout.
 */
export function watchImpact(changes: DayChange[], approvals: Approval[]): { alreadySent: string[]; cancelled: string[] } {
  const changedDates = new Set(changes.filter((c) => c.watchChanged).map((c) => c.date));
  const alreadySent: string[] = [];
  const cancelled: string[] = [];
  for (const a of approvals) {
    if (!changedDates.has(a.subject_date)) continue;
    if (a.sent_at) alreadySent.push(a.subject_date);
    else if (!a.send_started_at) cancelled.push(a.subject_date);
  }
  return { alreadySent: alreadySent.sort(), cancelled: cancelled.sort() };
}
