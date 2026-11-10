import "server-only";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/runs";
import { lockedWeeks } from "@/lib/gates";
import { isRestDay } from "@/lib/labels";
import { runState, upcomingRuns, waitingCount, type ApprovalRow, type RunState, type UpcomingRun } from "@/lib/watch-approve";
import { addDays, checkinDue, gatePassed, mondayOf, todayLocal } from "@/lib/weeks";
import { diffPlans, notesAdded, watchImpact, type DayChange, type DraftPlan } from "@/lib/proposal-diff";
import type { HealthDay, RunExtra, StrengthSession, PlanDay, PlanWeek, RecoverySnapshot, RunRow } from "@/lib/types";
import { BASELINE_DAYS } from "@/lib/insights-kpis";
import type { InsightsRange } from "@/lib/insights-range";
import type { RunForTable } from "@/lib/workout-table";

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
    .select("coros_id, started_at, distance_km, duration_s, avg_hr, training_load")
    .order("started_at", { ascending: false });
  if (error) throw new Error(`Could not read runs: ${error.message}`);
  return data as RunRow[];
}

export type RunDetail = {
  run: RunRow & { raw: unknown };
  plannedDay: PlanDay | null; // what the plan said for that home zone day
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

  const date = localDate(run.started_at);
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
    dayRuns: (all.data as RunRow[]).filter((r) => localDate(r.started_at) === date),
  };
}

// ---- Calendar link

/** The date the current calendar link was made (yyyy-mm-dd), or null if there is none. The link itself is never stored. */
export async function loadFeedCreatedOn(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_feeds").select("created_at").maybeSingle();
  if (error) throw new Error("Could not read the calendar link.");
  return data ? localDate(data.created_at) : null;
}

// ---- One planned day

export type PlanDayPage = {
  day: PlanDay;
  locked: boolean;
  doneRuns: RunRow[]; // runs the watch recorded on that day
  watch: { state: RunState; error: string | null } | null; // null when nothing is planned
};

/** One plan day with what was done and where it is on the watch. Null if the date is not in the plan. */
export async function loadPlanDay(date: string): Promise<PlanDayPage | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!version) return null;

  const [dayRes, gates, approval, runs] = await Promise.all([
    supabase.from("plan_days").select("date, week, run, gym, coaching_notes").eq("plan_version_id", version.id).eq("date", date).maybeSingle(),
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
    supabase.from("approvals").select("subject_date, sent_at, send_error").eq("kind", "watch_workout").eq("subject_date", date).maybeSingle(),
    supabase.from("runs").select("coros_id, started_at, distance_km, duration_s, avg_hr").order("started_at"),
  ]);
  if (dayRes.error || gates.error || approval.error || runs.error) throw new Error("Could not read that day.");
  if (!dayRes.data) return null;

  const day = dayRes.data as PlanDay;
  const hasRun = !isRestDay(day.run?.type);
  const row = (approval.data as ApprovalRow | null) ?? undefined;
  return {
    day,
    locked: lockedWeeks(gatePassed(gates.data ?? [])).includes(day.week),
    doneRuns: (runs.data as RunRow[]).filter((r) => localDate(r.started_at) === date),
    watch: hasRun ? { state: runState(row), error: row?.send_error ?? null } : null,
  };
}

// ---- Approve runs for the watch

export type ApprovePageData = { runs: UpcomingRun[]; waiting: number };

export async function loadApprovePage(horizonDays = 14): Promise<ApprovePageData> {
  const supabase = await createClient();
  const today = todayLocal();
  const { data: version } = await supabase
    .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!version) throw new Error("Could not read the plan.");

  const [days, approvals, gates] = await Promise.all([
    supabase.from("plan_days").select("date, week, run, gym").eq("plan_version_id", version.id)
      .gte("date", today).lte("date", addDays(today, horizonDays - 1)).order("date"),
    supabase.from("approvals").select("subject_date, sent_at, send_error").eq("kind", "watch_workout").gte("subject_date", today),
    supabase.from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID),
  ]);
  if (days.error || approvals.error || gates.error) throw new Error("Could not read the runs to approve.");

  const locked = lockedWeeks(gatePassed(gates.data ?? []));
  const runs = upcomingRuns(days.data as PlanDay[], approvals.data as ApprovalRow[], locked, today, horizonDays);
  return { runs, waiting: waitingCount(runs) };
}

// ---- Weekly check in

export type CheckinSummary = {
  week_start: string;
  morning_weight_kg: number | null;
  height_cm: number | null;
  feeling: string | null;
  pain_score: number;
  pain_repeated: boolean;
  pain_lasted_hours: number;
  pain_worse_next_morning: boolean;
  pain_flags: string[];
  pain_stop: boolean;
  pain_stop_message: string | null;
  photo_front: string | null;
  photo_side: string | null;
  photo_back: string | null;
};

export type CheckinPageData = {
  userId: string;
  weekStart: string;
  current: CheckinSummary | null;
  history: CheckinSummary[];
  photoUrls: Partial<Record<"front" | "side" | "back", string>>; // links that stop working after an hour
  stopMessage: string | null; // from the newest check in, if it says stop
};

export async function loadCheckinPage(): Promise<CheckinPageData> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");
  const weekStart = mondayOf(todayLocal());

  const { data, error } = await supabase
    .from("checkins")
    .select("week_start, morning_weight_kg, height_cm, feeling, pain_score, pain_repeated, pain_lasted_hours, pain_worse_next_morning, pain_flags, pain_stop, pain_stop_message, photo_front, photo_side, photo_back")
    .order("week_start", { ascending: false })
    .limit(8);
  if (error) throw new Error("Could not read your check ins.");

  const history = (data ?? []) as CheckinSummary[];
  const current = history.find((c) => c.week_start === weekStart) ?? null;

  // Photos are private. Show them only through links that expire.
  const photoUrls: CheckinPageData["photoUrls"] = {};
  if (current) {
    for (const slot of ["front", "side", "back"] as const) {
      const path = current[`photo_${slot}`];
      if (!path) continue;
      const { data: signed } = await supabase.storage.from("photos").createSignedUrl(path, 3600);
      if (signed?.signedUrl) photoUrls[slot] = signed.signedUrl;
    }
  }
  return {
    userId: auth.user.id,
    weekStart,
    current,
    history,
    photoUrls,
    stopMessage: history[0]?.pain_stop ? history[0].pain_stop_message : null,
  };
}

// ---- Home: things that need attention

export async function loadHomeStatus(): Promise<{ painStopMessage: string | null; checkinDue: boolean }> {
  const supabase = await createClient();
  const today = todayLocal();
  const { data, error } = await supabase
    .from("checkins").select("week_start, pain_stop, pain_stop_message").order("week_start", { ascending: false }).limit(1);
  if (error) throw new Error("Could not read your check ins.");
  const newest = data?.[0];
  return {
    painStopMessage: newest?.pain_stop ? (newest.pain_stop_message ?? "Your last check in says stop.") : null,
    checkinDue: checkinDue(today, newest?.week_start === mondayOf(today)),
  };
}

// ---- A draft plan waiting for Vicky

/** The version name of a draft waiting for approval, or null. Never throws: a missing table must not break the page. */
export async function waitingDraftVersion(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plan_proposals").select("version").eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return error ? null : (data?.version ?? null);
  } catch {
    return null;
  }
}

export type ProposalPage = {
  id: string;
  version: string;
  currentVersion: string;
  reason: string;
  createdOn: string;
  errors: string[];
  warnings: string[];
  changes: DayChange[];
  notesAdded: number;
  impact: { alreadySent: string[]; cancelled: string[] };
};

/** The newest draft with what it would change. Null when there is no draft. */
export async function loadProposal(): Promise<ProposalPage | null> {
  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("plan_proposals")
    .select("id, version, reason, checks, source, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not read the draft plan.");
  if (!draft) return null;

  const { data: version } = await supabase
    .from("plan_versions").select("id, version").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!version) throw new Error("Could not read the plan.");

  const [days, approvals] = await Promise.all([
    supabase.from("plan_days").select("date, week, run, gym, nutrition, coaching_notes").eq("plan_version_id", version.id),
    supabase.from("approvals").select("subject_date, sent_at, send_started_at").eq("kind", "watch_workout"),
  ]);
  if (days.error || approvals.error) throw new Error("Could not compare the draft with your plan.");

  const current = days.data as PlanDay[];
  const plan = draft.source as DraftPlan;
  const changes = diffPlans(current, plan);
  return {
    id: draft.id,
    version: draft.version,
    currentVersion: version.version,
    reason: draft.reason,
    createdOn: localDate(draft.created_at),
    errors: (draft.checks?.errors ?? []) as string[],
    warnings: (draft.checks?.warnings ?? []) as string[],
    changes,
    notesAdded: notesAdded(current, plan),
    impact: watchImpact(changes, approvals.data ?? []),
  };
}


const HEALTH_COLUMNS = [
  "day", "sleep_score", "sleep_asleep_min", "sleep_total_min", "sleep_period_min", "sleep_deep_min", "sleep_light_min",
  "sleep_rem_min", "sleep_awake_min", "sleep_nap_min", "hrv_avg_ms", "hrv_label", "hrv_normal_low_ms", "hrv_normal_high_ms",
  "hrv_baseline_ms", "resting_hr", "hr_avg", "stress_avg", "steps", "exercise_min", "load_short", "load_long", "load_ratio",
  "load_label", "recovery_avg", "recovery_min", "recovery_max", "recovery_last", "vo2max", "running_level",
  "threshold_pace_s", "pred_5k_s", "pred_10k_s", "pred_half_s", "pred_marathon_s", "complete",
].join(", ");

/** How far back the top cards look for the newest real value of each metric. */
const KPI_LOOKBACK_DAYS = 60;

export type InsightsData = {
  kpiRows: HealthDay[]; // the last 60 days, for the cards at the top
  rows: HealthDay[]; // the chosen range plus 28 days before it, for baselines
  snapshot: RecoverySnapshot | null; // the newest recovery status
  todaySnapshots: RecoverySnapshot[]; // every recovery reading taken today (Paris), for the "today so far" line
};

/** Watch health numbers for the Insights page. Read with the signed in user's session, so RLS applies. */
export async function loadInsights(range: InsightsRange, today: string): Promise<InsightsData> {
  const supabase = await createClient();
  const [kpi, inRange, snap, todaySnaps] = await Promise.all([
    supabase.from("health_daily").select(HEALTH_COLUMNS).gte("day", addDays(today, -KPI_LOOKBACK_DAYS)).order("day"),
    supabase.from("health_daily").select(HEALTH_COLUMNS).gte("day", addDays(range.from, -BASELINE_DAYS)).lte("day", addDays(range.to, 1)).order("day"),
    supabase.from("recovery_snapshots").select("taken_at, recovery_pct, level, full_recovery_h").order("taken_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("recovery_snapshots").select("taken_at, recovery_pct, level, full_recovery_h").eq("day", today).order("taken_at"),
  ]);
  if (kpi.error) throw new Error(`Could not read health data: ${kpi.error.message}`);
  if (inRange.error) throw new Error(`Could not read health data: ${inRange.error.message}`);
  if (snap.error) throw new Error(`Could not read recovery status: ${snap.error.message}`);
  if (todaySnaps.error) throw new Error(`Could not read recovery status: ${todaySnaps.error.message}`);
  return {
    kpiRows: kpi.data as unknown as HealthDay[],
    rows: inRange.data as unknown as HealthDay[],
    snapshot: snap.data as RecoverySnapshot | null,
    todaySnapshots: todaySnaps.data as RecoverySnapshot[],
  };
}


export type FitnessContext = {
  planTypes: Record<string, string>; // plan run type for each date, like "easy" or "long_run"
  targets: GoalTargets; // finish time goals from the plan
};

/** The newest plan's goals and what kind of run each day was meant to be. Used by the fitness charts. */
export async function loadFitnessContext(): Promise<FitnessContext> {
  const supabase = await createClient();
  const { data: version, error } = await supabase
    .from("plan_versions")
    .select("id, targets:source->targets")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read the plan: ${error.message}`);
  if (!version) throw new Error("No plan found. Run the plan import first.");
  const { data: days, error: daysError } = await supabase
    .from("plan_days")
    .select("date, type:run->>type")
    .eq("plan_version_id", version.id);
  if (daysError) throw new Error(`Could not read the plan days: ${daysError.message}`);
  const planTypes: Record<string, string> = {};
  for (const d of days as unknown as { date: string; type: string | null }[]) if (d.type) planTypes[d.date] = d.type;
  return { planTypes, targets: version.targets as unknown as GoalTargets };
}


/**
 * The extra COROS details for one run. Never throws: if the details columns are not there yet or the read fails,
 * the run page still opens and says nothing has arrived.
 */
export async function loadRunExtra(corosId: string): Promise<RunExtra | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("runs")
      .select("training_load, aerobic_te, anaerobic_te, training_focus, performance, perceived_effort, workout_note, cadence_spm, stride_length_m, power_w, elevation_m, elev_loss_m, best_km_pace_s, detail_fetched_at")
      .eq("coros_id", corosId)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as RunExtra;
  } catch {
    return null;
  }
}


const STRENGTH_COLUMNS = "id, source, coros_id, started_at, day, workout_name, duration_s, total_time_s, sets_count, avg_hr, calories, training_load, aerobic_te, anaerobic_te, training_focus, perceived_effort, workout_note, strength_sets(source, position, exercise, reps, weight_kg, seconds, avg_hr, max_hr)";

/**
 * Strength sessions from the watch between two Paris dates, with their sets. Never throws: if the tables are not
 * there yet or the read fails, the Gym pages still open and show no watch sessions.
 */
export async function loadStrength(from: string, to: string): Promise<StrengthSession[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("strength_sessions")
      .select(STRENGTH_COLUMNS)
      .gte("day", from)
      .lte("day", to)
      .order("started_at");
    if (error || !data) return [];
    return (data as unknown as (Omit<StrengthSession, "sets"> & { strength_sets: StrengthSession["sets"] })[]).map(({ strength_sets, ...s }) => ({
      ...s,
      sets: [...strength_sets].sort((a, b) => (a.source === b.source ? a.position - b.position : a.source === "coros" ? -1 : 1)),
    }));
  } catch {
    return [];
  }
}

/** The earliest day the watch recorded a strength session, or null if there is none. Never throws. */
export async function loadFirstStrengthDay(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("strength_sessions").select("day").order("day").limit(1).maybeSingle();
    return (data?.day as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The strength sessions the watch recorded on one date. Null if there are none. */
export async function loadGymDay(date: string): Promise<StrengthSession[] | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const sessions = await loadStrength(date, date);
  return sessions.length ? sessions : null;
}


/**
 * The runs on the Paris days from..to, with the effort word and note the workout table shows.
 * Never throws: if the read fails, the table shows only the gym sessions.
 */
export async function loadWorkoutRuns(from: string, to: string): Promise<RunForTable[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("runs")
      .select("coros_id, started_at, distance_km, duration_s, avg_hr, training_load, perceived_effort, workout_note")
      .gte("started_at", `${addDays(from, -1)}T00:00:00Z`)
      .lte("started_at", `${addDays(to, 1)}T23:59:59Z`)
      .order("started_at");
    if (error || !data) return [];
    return (data as unknown as RunForTable[]).filter((r) => {
      const day = localDate(r.started_at);
      return day >= from && day <= to;
    });
  } catch {
    return [];
  }
}
