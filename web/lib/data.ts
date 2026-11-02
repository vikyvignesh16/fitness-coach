import "server-only";
import { createClient } from "@/lib/supabase/server";
import { londonDate } from "@/lib/runs";
import { lockedWeeks } from "@/lib/gates";
import { sessionProgress, type HistorySet, type LoggedSet, type PlannedExercise } from "@/lib/gym";
import { upcomingRuns, waitingCount, type ApprovalRow, type UpcomingRun } from "@/lib/watch-approve";
import { currentWeekNumber, gatePassed, todayLondon } from "@/lib/weeks";
import type { PlanDay, PlanWeek, RunRow } from "@/lib/types";

import { ANKLE_GATE_ID } from "@/lib/gate-record";

export type GoalTargets = { a: string; b: string; c: string };

export type DashboardData = {
  version: string;
  raceDate: string; // yyyy-mm-dd, from the plan
  targets: GoalTargets; // finish time goals, from the plan
  weeks: PlanWeek[];
  days: PlanDay[];
  runs: RunRow[];
  ankleGatePassed: boolean;
};

/** Everything the dashboard and plan pages need. Read with the signed in user's session, so RLS applies. */
export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: version, error: versionError } = await supabase
    .from("plan_versions")
    // Pull two small fields out of the stored plan JSON instead of the whole file.
    .select("id, version, race_date:source->>race_date, targets:source->targets")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new Error(`Could not read the plan: ${versionError.message}`);
  if (!version) throw new Error("No plan found. Run the plan import first.");

  const [weeks, days, runs, gates] = await Promise.all([
    supabase.from("plan_weeks").select("week, start_date, phase, total_km").eq("plan_version_id", version.id).order("week"),
    supabase.from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id).order("date"),
    supabase.from("runs").select("coros_id, started_at, distance_km, duration_s, avg_hr").order("started_at"),
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
  ]);
  for (const [name, r] of [["weeks", weeks], ["days", days], ["runs", runs], ["approvals", gates]] as const) {
    if (r.error) throw new Error(`Could not read ${name}: ${r.error.message}`);
  }

  return {
    version: version.version,
    raceDate: version.race_date as string,
    targets: version.targets as unknown as GoalTargets,
    weeks: weeks.data as PlanWeek[],
    days: days.data as PlanDay[],
    runs: runs.data as RunRow[],
    ankleGatePassed: gatePassed(gates.data ?? []),
  };
}

export async function loadRuns(): Promise<RunRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("runs")
    .select("coros_id, started_at, distance_km, duration_s, avg_hr")
    .order("started_at", { ascending: false });
  if (error) throw new Error(`Could not read runs: ${error.message}`);
  return data as RunRow[];
}

export type RunDetail = {
  run: RunRow & { raw: unknown };
  plannedDay: PlanDay | null; // what the plan said for that London day
  dayRuns: RunRow[]; // every run that day, since planned km is for the whole day
};

/** One run, the plan for its day, and the other runs that day. Null if the run does not exist. */
export async function loadRunDetail(corosId: string): Promise<RunDetail | null> {
  const supabase = await createClient();
  const { data: run, error } = await supabase
    .from("runs")
    .select("coros_id, started_at, distance_km, duration_s, avg_hr, raw")
    .eq("coros_id", corosId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the run: ${error.message}`);
  if (!run) return null;

  const date = londonDate(run.started_at);
  const { data: version } = await supabase
    .from("plan_versions")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const [plan, all] = await Promise.all([
    version
      ? supabase.from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id).eq("date", date).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("runs").select("coros_id, started_at, distance_km, duration_s, avg_hr"),
  ]);
  if (plan.error) throw new Error(`Could not read the plan day: ${plan.error.message}`);
  if (all.error) throw new Error(`Could not read runs: ${all.error.message}`);

  return {
    run: run as RunDetail["run"],
    plannedDay: (plan.data as PlanDay | null) ?? null,
    dayRuns: (all.data as RunRow[]).filter((r) => londonDate(r.started_at) === date),
  };
}

// ---- Gym

export type GymWeekData = {
  weeks: PlanWeek[]; // every week that has gym sessions, for the arrows
  week: PlanWeek;
  locked: boolean;
  sessions: { day: PlanDay; progress: { done: number; total: number }; started: boolean; finished: boolean }[];
};

type SetRowFromDb = {
  exercise: string; set_no: number; reps: number | null; load_kg: number | null; seconds: number | null; done: boolean;
};

const GYM_SET_COLUMNS = "exercise, set_no, reps, load_kg, seconds, done";

function addDaysTo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadGymWeek(requestedWeek: number | null): Promise<GymWeekData> {
  const supabase = await createClient();
  const { data: version, error: ve } = await supabase
    .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (ve || !version) throw new Error("Could not read the plan.");

  const [weeksRes, gates] = await Promise.all([
    supabase.from("plan_weeks").select("week, start_date, phase, total_km").eq("plan_version_id", version.id).order("week"),
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
  ]);
  if (weeksRes.error) throw new Error("Could not read the weeks.");
  if (gates.error) throw new Error("Could not read the ankle check.");

  const weeks = (weeksRes.data as PlanWeek[]).filter((w) => w.phase !== "Actual");
  const fallback = Math.max(currentWeekNumber(weeksRes.data as PlanWeek[], todayLondon()), weeks[0].week);
  const week = weeks.find((w) => w.week === requestedWeek) ?? weeks.find((w) => w.week === fallback) ?? weeks[0];
  const locked = lockedWeeks(gatePassed(gates.data ?? [])).includes(week.week);

  const [daysRes, setsRes, sessionsRes] = await Promise.all([
    supabase.from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id).eq("week", week.week).order("date"),
    supabase
      .from("gym_sets")
      .select(`${GYM_SET_COLUMNS}, gym_sessions!inner(date)`)
      .gte("gym_sessions.date", week.start_date)
      .lte("gym_sessions.date", addDaysTo(week.start_date, 6)),
    supabase
      .from("gym_sessions")
      .select("date, finished_at")
      .gte("date", week.start_date)
      .lte("date", addDaysTo(week.start_date, 6)),
  ]);
  if (daysRes.error || setsRes.error || sessionsRes.error) throw new Error("Could not read the gym log.");

  const setsByDate = new Map<string, LoggedSet[]>();
  for (const row of setsRes.data as unknown as (SetRowFromDb & { gym_sessions: { date: string } })[]) {
    const list = setsByDate.get(row.gym_sessions.date) ?? [];
    list.push(row);
    setsByDate.set(row.gym_sessions.date, list);
  }
  const sessionRows = new Map((sessionsRes.data ?? []).map((s) => [s.date as string, s]));

  const sessions = (daysRes.data as PlanDay[])
    .filter((d) => d.gym && d.gym.key_exercises.length > 0)
    .map((day) => {
      const logged = setsByDate.get(day.date) ?? [];
      return {
        day,
        progress: sessionProgress(day.gym!.key_exercises, logged),
        started: logged.length > 0,
        finished: Boolean(sessionRows.get(day.date)?.finished_at),
      };
    });
  return { weeks, week, locked, sessions };
}

export type GymSessionData = {
  day: PlanDay;
  locked: boolean;
  logged: LoggedSet[];
  history: HistorySet[];
  finished: boolean;
};

export async function loadGymSession(date: string): Promise<GymSessionData | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!version) return null;

  const { data: day, error } = await supabase
    .from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id).eq("date", date).maybeSingle();
  if (error) throw new Error("Could not read the plan day.");
  if (!day?.gym?.key_exercises?.length) return null;

  const names = (day.gym.key_exercises as PlannedExercise[]).map((e) => e.name);
  const [gates, setsRes, histRes, sessionRes] = await Promise.all([
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
    supabase.from("gym_sets").select(`${GYM_SET_COLUMNS}, gym_sessions!inner(date)`).eq("gym_sessions.date", date),
    supabase
      .from("gym_sets")
      .select("exercise, load_kg, reps, done, gym_sessions!inner(date)")
      .in("exercise", names)
      .lt("gym_sessions.date", date),
    supabase.from("gym_sessions").select("finished_at").eq("date", date).maybeSingle(),
  ]);
  if (gates.error || setsRes.error || histRes.error || sessionRes.error) throw new Error("Could not read the gym log.");

  return {
    day: day as PlanDay,
    locked: lockedWeeks(gatePassed(gates.data ?? [])).includes(day.week),
    logged: setsRes.data as unknown as LoggedSet[],
    history: (histRes.data as unknown as (Omit<HistorySet, "date"> & { gym_sessions: { date: string } })[]).map((h) => ({
      date: h.gym_sessions.date, exercise: h.exercise, load_kg: h.load_kg, reps: h.reps, done: h.done,
    })),
    finished: Boolean(sessionRes.data?.finished_at),
  };
}

// ---- Approve runs for the watch

export type ApprovePageData = { runs: UpcomingRun[]; waiting: number };

export async function loadApprovePage(horizonDays = 14): Promise<ApprovePageData> {
  const supabase = await createClient();
  const today = todayLondon();
  const { data: version } = await supabase
    .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!version) throw new Error("Could not read the plan.");

  const [days, approvals, gates] = await Promise.all([
    supabase.from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id)
      .gte("date", today).lte("date", addDaysTo(today, horizonDays - 1)).order("date"),
    supabase.from("approvals").select("subject_date, sent_at, send_error").eq("kind", "watch_workout").gte("subject_date", today),
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
  ]);
  if (days.error || approvals.error || gates.error) throw new Error("Could not read the runs to approve.");

  const locked = lockedWeeks(gatePassed(gates.data ?? []));
  const runs = upcomingRuns(days.data as PlanDay[], approvals.data as ApprovalRow[], locked, today, horizonDays);
  return { runs, waiting: waitingCount(runs) };
}
