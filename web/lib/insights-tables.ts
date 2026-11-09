import type { DataTable } from "@/components/insights/chart-card";
import { formatMinutes } from "./insights-kpis";
import type { HrvPoint, LoadPoint, RhrPoint, ScorePoint, SleepPoint, VolumePoint } from "./insights-series";
import type { View } from "./insights-range";

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
