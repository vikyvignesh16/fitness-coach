// Row shapes from Supabase (see supabase/migrations/). Only the columns the dashboard reads.

/** One part of a repeat block: the hard bit or the recovery bit. Only some fields are set per step. */
export type PlanStepPart = {
  distance_km?: number;
  duration_min?: number;
  duration_sec?: number;
  pace_min_per_km?: string;
  effort?: string;
};

export type PlanStep = {
  step: string; // run, warm_up, repeats, cool_down
  distance_km?: number;
  duration_min?: number | string; // a cool down can say "until planned total distance"
  pace_min_per_km?: string;
  effort?: string;
  instruction?: string;
  repetitions?: number;
  work?: PlanStepPart;
  recovery?: PlanStepPart | null;
};

export type PlanRun = {
  type: string;
  distance_km: number;
  duration_min?: number;
  pace_or_effort?: string;
  notes?: string;
  steps?: PlanStep[];
};

export type PlanGym = {
  session: string;
  key_exercises: { name: string; sets: number | null; reps: string; rir: number | null }[];
};

/** Web only guidance for a day. Never sent to the watch or the calendar. Plan v5.1 has none. */
export type CoachingNotes = {
  before?: string;
  during?: string;
  after?: string;
  next_24_48h?: string;
  stop_or_modify?: string;
  heart_rate?: string;
};

export type PlanDay = {
  date: string; // yyyy-mm-dd
  week: number;
  run: PlanRun | null;
  gym: PlanGym | null;
  coaching_notes?: CoachingNotes | null;
};

export type PlanWeek = {
  week: number;
  start_date: string;
  phase: string;
  total_km: number;
};

export type RunRow = {
  coros_id: string;
  started_at: string; // ISO timestamp from the watch, UTC
  distance_km: number;
  duration_s: number;
  avg_hr: number | null;
};

export type DayActual = {
  distanceKm: number;
  durationS: number;
  avgHr: number | null; // weighted by run time
  runs: number;
};

export type WeekPoint = {
  week: number;
  startDate: string;
  phase: string;
  plannedKm: number;
  actualKm: number;
};

/** One row of health_daily. Every number can be null: null means COROS gave nothing, which is not the same as zero. */
export type HealthDay = {
  day: string; // yyyy-mm-dd, Paris date
  sleep_score: number | null;
  sleep_asleep_min: number | null;
  sleep_total_min: number | null;
  sleep_period_min: number | null;
  sleep_deep_min: number | null;
  sleep_light_min: number | null;
  sleep_rem_min: number | null;
  sleep_awake_min: number | null;
  sleep_nap_min: number | null;
  hrv_avg_ms: number | null;
  hrv_label: string | null;
  hrv_normal_low_ms: number | null;
  hrv_normal_high_ms: number | null;
  hrv_baseline_ms: number | null;
  resting_hr: number | null;
  hr_avg: number | null;
  stress_avg: number | null;
  steps: number | null;
  exercise_min: number | null;
  load_short: number | null;
  load_long: number | null;
  load_ratio: number | null;
  load_label: string | null;
  recovery_avg: number | null;
  recovery_min: number | null;
  recovery_max: number | null;
  recovery_last: number | null;
  vo2max: number | null;
  running_level: number | null;
  threshold_pace_s: number | null;
  pred_5k_s: number | null;
  pred_10k_s: number | null;
  pred_half_s: number | null;
  pred_marathon_s: number | null;
  complete: boolean;
};

export type RecoverySnapshot = {
  taken_at: string; // ISO time
  recovery_pct: number;
  level: string | null;
  full_recovery_h: number | null;
};
