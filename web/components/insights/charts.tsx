"use client";

import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AXIS_LINE, AXIS_TICK, GRID, gapFor, Legend, TipBox } from "@/components/insights/chart-parts";
import { compareToBaseline, formatMinutes } from "@/lib/insights-kpis";
import type { HrvPoint, LoadPoint, RhrPoint, ScorePoint, SleepPoint, VolumePoint } from "@/lib/insights-series";

const HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const SURFACE = "var(--card)";
const NEUTRAL = "var(--muted-foreground)";

type Tip<T> = { active?: boolean; payload?: { payload: T }[] };
const hm = (hours: number | null) => (hours === null ? "no data" : formatMinutes(Math.round(hours * 60)));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Frame({ label, legend, children }: { label: string; legend?: React.ComponentProps<typeof Legend>["items"]; children: React.ReactNode }) {
  return (
    <figure className="space-y-3">
      {legend && <figcaption><Legend items={legend} /></figcaption>}
      <div role="img" aria-label={`${label} The data table below has the same numbers.`}>
        <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 360, height: HEIGHT }}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const xAxis = <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={24} />;
const yAxis = (domain?: [number | string, number | string], unit?: string) => (
  <YAxis width={40} tickLine={false} axisLine={false} tick={AXIS_TICK} domain={domain} unit={unit} />
);

/** A dot only where a line cannot show the value on its own: a lone point, or one that is marked. */
function dotFor<T extends { isolated: boolean }>(color: string, marked?: (p: T) => boolean) {
  function Dot(props: { cx?: number; cy?: number; index?: number; payload?: T }) {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
    if (marked?.(payload)) return <circle key={index} cx={cx} cy={cy} r={5} fill={SURFACE} stroke={color} strokeWidth={2.5} />;
    if (payload.isolated) return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />;
    return <g key={index} />;
  }
  return Dot;
}
const activeDot = (color: string) => ({ r: 5, fill: color, stroke: SURFACE, strokeWidth: 2 });

// ---- 1. Sleep composition ----
const STAGES = [
  { key: "deep", name: "Deep", color: "var(--m-deep)" },
  { key: "rem", name: "REM", color: "var(--m-rem)" },
  { key: "light", name: "Light", color: "var(--m-light)" },
  { key: "awake", name: "Awake", color: "var(--m-awake)" },
] as const;

function SleepTip({ active, payload }: Tip<SleepPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TipBox
      title={p.label}
      rows={[
        ...STAGES.map((s) => ({ color: s.color, label: s.name, value: hm(p[s.key]) })),
        { label: "asleep", value: p.asleepMin === null ? "no data" : formatMinutes(p.asleepMin) },
        { label: "in bed", value: p.periodMin === null ? "no data" : formatMinutes(p.periodMin) },
      ]}
      note={p.napMin ? `Naps are not in the bars: ${formatMinutes(p.napMin)}.` : undefined}
    />
  );
}

export function SleepCompositionChart({ data }: { data: SleepPoint[] }) {
  return (
    <Frame label="Stacked columns of sleep stages in hours for each night: deep, REM, light and awake." legend={STAGES.map((s) => ({ label: s.name, color: s.color, kind: "box" as const }))}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis([0, "auto"], "h")}
        <Tooltip content={<SleepTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {STAGES.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="sleep" fill={s.color} stroke={SURFACE} strokeWidth={gapFor(data.length)}
            maxBarSize={24} radius={i === STAGES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </Frame>
  );
}

// ---- 2. Sleep score ----
function ScoreTip({ active, payload }: Tip<ScorePoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.score === null) return <TipBox title={p.label} rows={[{ label: "sleep score", value: "no data" }]} />;
  const against = compareToBaseline(p.score, p.baseline);
  return (
    <TipBox title={p.label} rows={[{ color: "var(--m-score)", label: "sleep score", value: String(p.score) }]}
      note={<>{against ?? "No 28 day average yet"}{p.low ? <><br />Unusually low for you. This is a marker, not a diagnosis.</> : null}</>} />
  );
}

export function SleepScoreChart({ data }: { data: ScorePoint[] }) {
  return (
    <Frame label="Line chart of the sleep score from 0 to 100, with your 28 day average as a dashed line."
      legend={[
        { label: "Sleep score", color: "var(--m-score)", kind: "line" },
        { label: "Your 28 day average", color: NEUTRAL, kind: "dash" },
        { label: "Unusually low for you", color: "var(--m-score)", kind: "ring" },
      ]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis([0, 100])}
        <Tooltip content={<ScoreTip />} />
        <Line dataKey="baseline" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="score" stroke="var(--m-score)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          dot={dotFor<ScorePoint>("var(--m-score)", (p) => p.low)} activeDot={activeDot("var(--m-score)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 3. HRV ----
function HrvTip({ active, payload }: Tip<HrvPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.hrv === null) return <TipBox title={p.label} rows={[{ label: "HRV", value: "no data" }]} />;
  return (
    <TipBox title={p.label}
      rows={[
        { color: "var(--m-hrv)", label: "ms HRV", value: String(p.hrv) },
        ...(p.avg7 !== null ? [{ color: NEUTRAL, label: "ms 7 day average", value: String(p.avg7) }] : []),
      ]}
      note={<>
        {p.band ? <>COROS normal range {p.band[0]} to {p.band[1]} ms<br /></> : null}
        {p.baseline !== null ? <>COROS baseline {p.baseline} ms ({compareToBaseline(p.hrv, p.baseline)?.replace(" your 28 day average", " the baseline")})<br /></> : null}
        {p.status ? `COROS says: ${p.status}` : null}
      </>} />
  );
}

export function HrvChart({ data }: { data: HrvPoint[] }) {
  return (
    <Frame label="Line chart of nightly HRV in milliseconds over a shaded band showing your COROS normal range, with a 7 day average line."
      legend={[
        { label: "Nightly HRV", color: "var(--m-hrv)", kind: "line" },
        { label: "7 day average", color: NEUTRAL, kind: "line" },
        { label: "COROS normal range", color: "var(--m-hrv)", kind: "band" },
      ]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis(["dataMin - 5", "dataMax + 5"], "")}
        <Tooltip content={<HrvTip />} />
        <Area dataKey="band" stroke="none" fill="var(--m-hrv)" fillOpacity={0.12} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="avg7" stroke={NEUTRAL} strokeWidth={2} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="hrv" stroke="var(--m-hrv)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          dot={dotFor<HrvPoint>("var(--m-hrv)")} activeDot={activeDot("var(--m-hrv)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 4. Resting heart rate ----
function RhrTip({ active, payload }: Tip<RhrPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.rhr === null) return <TipBox title={p.label} rows={[{ label: "resting heart rate", value: "no data" }]} />;
  return (
    <TipBox title={p.label} rows={[{ color: "var(--m-rhr)", label: "bpm resting", value: String(p.rhr) }]}
      note={compareToBaseline(p.rhr, p.baseline) ?? "No 28 day average yet"} />
  );
}

export function RestingHrChart({ data }: { data: RhrPoint[] }) {
  return (
    <Frame label="Line chart of resting heart rate in beats per minute, with your 28 day average as a dashed line."
      legend={[
        { label: "Resting heart rate", color: "var(--m-rhr)", kind: "line" },
        { label: "Your 28 day average", color: NEUTRAL, kind: "dash" },
      ]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis(["dataMin - 3", "dataMax + 3"])}
        <Tooltip content={<RhrTip />} />
        <Line dataKey="baseline" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="rhr" stroke="var(--m-rhr)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          dot={dotFor<RhrPoint>("var(--m-rhr)")} activeDot={activeDot("var(--m-rhr)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 9. Short-term against long-term load ----
function LoadTip({ active, payload }: Tip<LoadPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.short === null && p.long === null) return <TipBox title={p.label} rows={[{ label: "training load", value: "no data" }]} />;
  return (
    <TipBox title={p.label}
      rows={[
        { color: "var(--m-load-short)", label: "short-term", value: String(p.short ?? "no data") },
        { color: "var(--m-load-long)", label: "long-term", value: String(p.long ?? "no data") },
      ]}
      note={<>{p.ratio !== null ? <>Ratio {p.ratio.toFixed(2)}<br /></> : null}{p.status ? `COROS says: ${p.status}` : null}</>} />
  );
}

export function LoadChart({ data }: { data: LoadPoint[] }) {
  return (
    <Frame label="Two line chart of COROS short-term and long-term training load."
      legend={[
        { label: "Short-term load", color: "var(--m-load-short)", kind: "line" },
        { label: "Long-term load", color: "var(--m-load-long)", kind: "line" },
      ]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis(["dataMin - 5", "dataMax + 5"])}
        <Tooltip content={<LoadTip />} />
        <Line dataKey="long" stroke="var(--m-load-long)" strokeWidth={2} strokeLinecap="round" dot={dotFor<LoadPoint>("var(--m-load-long)")} activeDot={activeDot("var(--m-load-long)")} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="short" stroke="var(--m-load-short)" strokeWidth={2} strokeLinecap="round" dot={dotFor<LoadPoint>("var(--m-load-short)")} activeDot={activeDot("var(--m-load-short)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 7. Weekly running volume ----
function VolumeTip({ active, payload }: Tip<VolumePoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TipBox title={`Week of ${p.label}${p.inProgress ? " (in progress)" : ""}`}
      rows={[
        { color: "var(--m-volume)", label: "km", value: String(p.km) },
        { label: "runs", value: String(p.runs) },
        ...(p.avg4 !== null ? [{ color: NEUTRAL, label: "km 4 week average", value: String(p.avg4) }] : []),
      ]}
      note={p.changePct !== null ? `${p.changePct > 0 ? "Up" : p.changePct < 0 ? "Down" : "Same as"} ${p.changePct === 0 ? "last week" : `${Math.abs(p.changePct)}% on last week`}` : p.inProgress ? `Not compared yet: ${plural(p.runs, "run")} so far.` : "No runs the week before."} />
  );
}

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  return (
    <Frame label="Columns of running distance in kilometres for each week, with a 4 week average line."
      legend={[
        { label: "Weekly distance", color: "var(--m-volume)", kind: "box" },
        { label: "4 week average", color: NEUTRAL, kind: "line" },
      ]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis([0, "auto"])}
        <Tooltip content={<VolumeTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        <Bar dataKey="km" fill="var(--m-volume)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.weekStart} fillOpacity={d.inProgress ? 0.55 : 1} />)}
        </Bar>
        <Line dataKey="avg4" stroke={NEUTRAL} strokeWidth={2} dot={false} activeDot={activeDot(NEUTRAL)} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}
