import type { DataTable } from "@/components/insights/chart-card";
import { formatMinutes } from "./insights-kpis";
import { formatHms, formatPace, type EfficiencyPoint, type FitnessPoint, type LongRunPoint } from "./insights-fitness";
import type { LoadSlot, RecoveryPoint, StressPoint } from "./insights-series";
import type { HrvPoint, LoadPoint, RhrPoint, ScorePoint, SleepPoint, VolumePoint } from "./insights-series";
import type { View } from "./insights-range";
import type { EffortHrvPoint, LoadHrvPoint } from "./insights-scatter";

const first = (view: View) => (view === "daily" ? "Day" : "Week starting");
const mins = (hours: number | null) => (hours === null ? null : formatMinutes(Math.round(hours * 60)));

export const sleepTable = (p: SleepPoint[], view: View): DataTable => ({
  columns: [first(view), "Deep", "REM", "Light", "Awake", "Asleep", "In bed"],
  rows: p.map((x) => [x.label, mins(x.deep), mins(x.rem), mins(x.light), mins(x.awake),
    x.asleepMin === null ? null : formatMinutes(x.asleepMin), x.periodMin === null ? null : formatMinutes(x.periodMin)]),
});

export const scoreTable = (p: ScorePoint[], view: View): DataTable => ({
  columns: [first(view), "Sleep score", "Your 28 day average", "Unusually low"],
  rows: p.map((x) => [x.label, x.score, x.baseline, x.score === null ? null : x.low ? "yes" : "no"]),
});

export const hrvTable = (p: HrvPoint[], view: View): DataTable => ({
  columns: [first(view), "HRV (ms)", "7 day average", "COROS normal range", "COROS says"],
  rows: p.map((x) => [x.label, x.hrv, x.avg7, x.band ? `${x.band[0]} to ${x.band[1]}` : null, x.status]),
});

export const rhrTable = (p: RhrPoint[], view: View): DataTable => ({
  columns: [first(view), "Resting HR (bpm)", "Your 28 day average"],
  rows: p.map((x) => [x.label, x.rhr, x.baseline]),
});

export const loadTable = (p: LoadPoint[], view: View): DataTable => ({
  columns: [first(view), "Short-term", "Long-term", "Ratio", "COROS says"],
  rows: p.map((x) => [x.label, x.short, x.long, x.ratio, x.status]),
});

export const volumeTable = (p: VolumePoint[]): DataTable => ({
  columns: ["Week starting", "Distance (km)", "Runs", "Change on last week", "4 week average (km)"],
  rows: p.map((x) => [x.label + (x.inProgress ? " (in progress)" : ""), x.km, x.runs, x.changePct === null ? null : `${x.changePct > 0 ? "+" : ""}${x.changePct}%`, x.avg4]),
});

export const longRunTable = (p: LongRunPoint[]): DataTable => ({
  columns: ["Week starting", "Longest run (km)", "Time", "Pace (min/km)", "Avg heart rate", "Runs that week"],
  rows: p.map((x) => [x.label, x.km, x.durationS === null ? null : formatHms(x.durationS), x.paceS === null ? null : formatPace(x.paceS), x.avgHr, x.runsThatWeek]),
});

export const fitnessTable = (p: FitnessPoint[], view: View): DataTable => ({
  columns: [first(view), "VO2max", "Threshold pace (min/km)", "Marathon prediction"],
  rows: p.map((x) => [x.label, x.vo2max, x.thresholdS === null ? null : formatPace(x.thresholdS), x.marathonS === null ? null : formatHms(x.marathonS)]),
});

export const efficiencyTable = (p: EfficiencyPoint[]): DataTable => ({
  columns: ["Date", "Distance (km)", "Avg heart rate", "Pace (min/km)"],
  rows: p.map((x) => [x.label, x.km, x.hr, formatPace(x.paceS)]),
});

export const stressTable = (p: StressPoint[], view: View): DataTable => ({
  columns: [first(view), "Average stress", "Your 28 day average"],
  rows: p.map((x) => [x.label, x.stress, x.baseline]),
});

export const recoveryTable = (p: RecoveryPoint[], view: View): DataTable => ({
  columns: [first(view), "Last reading (%)", "Lowest (%)", "Highest (%)"],
  rows: p.map((x) => [x.label, x.last, x.min, x.max]),
});

export const loadPerSlotTable = (p: LoadSlot[], view: View): DataTable => ({
  columns: [first(view), "Running", "Strength", "Total load", "Workouts with no load figure"],
  rows: p.map((x) => [x.label, x.total === null ? null : x.run, x.total === null ? null : x.strength, x.total, x.unscored]),
});

export const loadHrvTable = (p: LoadHrvPoint[]): DataTable => ({
  columns: ["Day", "Training load", "Next morning HRV (ms)", "COROS baseline (ms)", "Difference (ms)"],
  rows: p.map((x) => [x.label + (x.rest ? " (rest day)" : ""), x.load, x.hrv, x.baseline, x.deviation]),
});

export const effortHrvTable = (p: EffortHrvPoint[]): DataTable => ({
  columns: ["Day", "Workout", "How it felt", "HRV that morning (ms)"],
  rows: p.map((x) => [x.label, x.title, x.word, x.hrv]),
});
