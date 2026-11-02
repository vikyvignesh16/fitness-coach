// The rules for approving a planned run to be sent to the watch.
// Checked on the server, so they hold even if someone skips the screen.
// The web app only records the approval. A separate job sends it (the web app never holds COROS tokens).
import type { PlanDay } from "./types";

export const MAX_DAYS_AHEAD = 90; // COROS only accepts dates from today to 90 days ahead
export const MAX_PER_CALL = 14;

export type PlannedRun = { week: number; type: string; distanceKm: number };

export interface ApproveDb {
  getPlannedRun(date: string): Promise<PlannedRun | null>;
  isWeekLocked(week: number): Promise<boolean>;
  planVersionId(): Promise<string | null>;
  /** 'exists' when that day already has an approval. */
  insertApproval(row: { plan_version_id: string; subject_date: string }): Promise<"created" | "exists">;
}

export type ApproveResult =
  | { date: string; status: "approved" }
  | { date: string; status: "already" }
  | { date: string; status: "refused"; error: string };

const NO_RUN = new Set(["no_run", "not_recorded"]);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function approveOne(db: ApproveDb, date: string, today: string, versionId: string): Promise<ApproveResult> {
  if (!isDate(date)) return { date, status: "refused", error: "That date is not valid." };
  if (date < today) return { date, status: "refused", error: "That day has already passed." };
  if (date > addDays(today, MAX_DAYS_AHEAD)) {
    return { date, status: "refused", error: `COROS only takes workouts up to ${MAX_DAYS_AHEAD} days ahead.` };
  }
  const run = await db.getPlannedRun(date);
  if (!run || NO_RUN.has(run.type) || run.distanceKm <= 0) {
    return { date, status: "refused", error: "No run is planned for that day." };
  }
  if (await db.isWeekLocked(run.week)) {
    return { date, status: "refused", error: "This week is locked until the ankle check is passed." };
  }
  const outcome = await db.insertApproval({ plan_version_id: versionId, subject_date: date });
  return { date, status: outcome === "created" ? "approved" : "already" };
}

/** Approve one or more days. Each day gets its own result, and one refusal does not stop the others. */
export async function approveRuns(db: ApproveDb, dates: string[], today: string): Promise<ApproveResult[]> {
  const unique = [...new Set(dates)];
  if (unique.length === 0) return [];
  if (unique.length > MAX_PER_CALL) {
    return unique.map((date) => ({ date, status: "refused" as const, error: `Approve at most ${MAX_PER_CALL} days at a time.` }));
  }
  try {
    const versionId = await db.planVersionId();
    if (!versionId) return unique.map((date) => ({ date, status: "refused" as const, error: "Could not find the plan." }));
    const results: ApproveResult[] = [];
    for (const date of unique) {
      try {
        results.push(await approveOne(db, date, today, versionId));
      } catch {
        results.push({ date, status: "refused", error: "Could not save. Try again." }); // never show database errors
      }
    }
    return results;
  } catch {
    return unique.map((date) => ({ date, status: "refused" as const, error: "Could not save. Try again." }));
  }
}

// ---- what to show on the page

export type ApprovalRow = { subject_date: string; sent_at: string | null; send_error: string | null };
export type RunState = "waiting" | "queued" | "sent" | "failed";

export function runState(approval: ApprovalRow | undefined): RunState {
  if (!approval) return "waiting";
  if (approval.sent_at) return "sent";
  if (approval.send_error) return "failed";
  return "queued";
}

export type UpcomingRun = { day: PlanDay; state: RunState; locked: boolean; error: string | null };

/** Planned runs from today for `horizonDays` days, each with where it is in the approve and send process. */
export function upcomingRuns(
  days: PlanDay[],
  approvals: ApprovalRow[],
  lockedWeeks: number[],
  today: string,
  horizonDays: number,
): UpcomingRun[] {
  const last = addDays(today, horizonDays - 1);
  const byDate = new Map(approvals.map((a) => [a.subject_date, a]));
  return days
    .filter((d) => d.date >= today && d.date <= last)
    .filter((d) => d.run && !NO_RUN.has(d.run.type) && d.run.distance_km > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      day,
      state: runState(byDate.get(day.date)),
      locked: lockedWeeks.includes(day.week),
      error: byDate.get(day.date)?.send_error ?? null,
    }));
}

/** How many runs in the next `horizonDays` days still need Vicky's approval. Locked weeks do not count. */
export function waitingCount(runs: UpcomingRun[]): number {
  return runs.filter((r) => r.state === "waiting" && !r.locked).length;
}
