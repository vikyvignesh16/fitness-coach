// Row shapes from Supabase (see supabase/migrations/). Only the columns the dashboard reads.

export type PlanRun = {
  type: string;
  distance_km: number;
  duration_min?: number;
  pace_or_effort?: string;
  notes?: string;
};

export type PlanGym = {
  session: string;
  key_exercises: { name: string; sets: number | null; reps: string; rir: number | null }[];
};

export type PlanDay = {
  date: string; // yyyy-mm-dd
  week: number;
  run: PlanRun | null;
  gym: PlanGym | null;
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
