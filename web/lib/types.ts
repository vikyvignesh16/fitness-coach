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
