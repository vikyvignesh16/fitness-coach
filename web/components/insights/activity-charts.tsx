"use client";

import {
  Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AXIS_LINE, AXIS_TICK, GRID, gapFor, Legend, TipBox } from "@/components/insights/chart-parts";
import { compareToBaseline } from "@/lib/insights-kpis";
import type { LoadKind } from "@/lib/insights-range";
import type { IntradayPoint, LoadSlot, RecoveryPoint, StressPoint } from "@/lib/insights-series";

const HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const SURFACE = "var(--card)";
const NEUTRAL = "var(--muted-foreground)";
type Tip<T> = { active?: boolean; payload?: { payload: T }[] };

function Frame({ label, legend, height = HEIGHT, children }: { label: string; legend?: React.ComponentProps<typeof Legend>["items"]; height?: number; children: React.ReactNode }) {
  return (
    <figure className="space-y-3">
      {legend && <figcaption><Legend items={legend} /></figcaption>}
      <div role="img" aria-label={`${label} The data table below has the same numbers.`}>
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 360, height }}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const xAxis = <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={24} />;
const yAxis = (props: React.ComponentProps<typeof YAxis> = {}) => <YAxis width={40} tickLine={false} axisLine={false} tick={AXIS_TICK} {...props} />;

/** A dot only where a line cannot show the value on its own: a lone point. */
function dotFor<T extends { isolated: boolean }>(color: string) {
  function Dot(props: { cx?: number; cy?: number; index?: number; payload?: T }) {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || !payload?.isolated) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />;
  }
  return Dot;
}
const activeDot = (color: string) => ({ r: 5, fill: color, stroke: SURFACE, strokeWidth: 2 });
const nice = (step: number, pad: number): [(min: number) => number, (max: number) => number] => [
  (min) => Math.floor((min - pad) / step) * step,
  (max) => Math.ceil((max + pad) / step) * step,
];

// ---- 5. Stress ----
function StressTip({ active, payload }: Tip<StressPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.stress === null) return <TipBox title={p.label} rows={[{ label: "stress", value: "no data" }]} />;
  return <TipBox title={p.label} rows={[{ color: "var(--m-stress)", label: "average stress", value: String(p.stress) }]} note={compareToBaseline(p.stress, p.baseline) ?? "No 28 day average yet"} />;
}

export function StressChart({ data }: { data: StressPoint[] }) {
  return (
    <Frame label="Line chart of average stress each day, with your 28 day average as a dashed line."
      legend={[{ label: "Average stress", color: "var(--m-stress)", kind: "line" }, { label: "Your 28 day average", color: NEUTRAL, kind: "dash" }]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ domain: nice(10, 5), allowDecimals: false })}
        <Tooltip content={<StressTip />} />
        <Line dataKey="baseline" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="stress" stroke="var(--m-stress)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={dotFor<StressPoint>("var(--m-stress)")} activeDot={activeDot("var(--m-stress)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 6. Recovery status ----
function RecoveryTip({ active, payload }: Tip<RecoveryPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.last === null) return <TipBox title={p.label} rows={[{ label: "recovery", value: "no data" }]} />;
  return (
    <TipBox title={p.label} rows={[{ color: "var(--m-recovery)", label: "% last reading", value: String(p.last) }]}
      note={p.min !== null && p.max !== null ? `Lowest ${p.min}%, highest ${p.max}% that day` : undefined} />
  );
}

export function RecoveryChart({ data }: { data: RecoveryPoint[] }) {
  return (
    <Frame label="Line chart of the last recovery reading of each day, as a percentage, over a band showing that day's lowest and highest readings."
      legend={[{ label: "Last reading of the day", color: "var(--m-recovery)", kind: "line" }, { label: "Lowest to highest that day", color: "var(--m-recovery)", kind: "band" }]}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ domain: [0, 100], unit: "%", width: 44 })}
        <Tooltip content={<RecoveryTip />} />
        <Area dataKey="band" stroke="none" fill="var(--m-recovery)" fillOpacity={0.12} activeDot={false} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="last" stroke="var(--m-recovery)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={dotFor<RecoveryPoint>("var(--m-recovery)")} activeDot={activeDot("var(--m-recovery)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

function IntradayTip({ active, payload }: Tip<IntradayPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <TipBox title={`Today ${p.label}`} rows={[{ color: "var(--m-recovery)", label: "% recovery", value: String(p.pct) }]} note={p.level ?? undefined} />;
}

/** Today's readings so far. With fewer than two it says so in words, because one reading draws no line. */
export function RecoveryToday({ data }: { data: IntradayPoint[] }) {
  if (data.length === 0) return <p className="text-muted-foreground text-xs">No recovery reading yet today.</p>;
  if (data.length === 1) return <p className="text-xs"><span className="font-medium">Today so far:</span> {data[0].pct}%{data[0].level ? `, ${data[0].level}` : ""} at {data[0].label}. A line needs two readings, and they come every 3 hours.</p>;
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">Today so far</p>
      <Frame label="Line chart of today's recovery readings as a percentage." height={120}>
        <LineChart data={data} margin={MARGIN}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} />
          {yAxis({ domain: [0, 100], unit: "%", width: 44, ticks: [0, 50, 100] })}
          <Tooltip content={<IntradayTip />} />
          <Line dataKey="pct" stroke="var(--m-recovery)" strokeWidth={2} strokeLinecap="round" dot={{ r: 4, fill: "var(--m-recovery)", stroke: SURFACE, strokeWidth: 2 }} activeDot={activeDot("var(--m-recovery)")} isAnimationActive={false} />
        </LineChart>
      </Frame>
    </div>
  );
}

// ---- 8. Training load per day ----
function LoadSlotTip({ active, payload, kind }: Tip<LoadSlot> & { kind: LoadKind }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.total === null) return <TipBox title={p.label} rows={[{ label: "training load", value: "no load figure" }]} note={`${p.workouts} ${p.workouts === 1 ? "workout" : "workouts"} without a COROS load number`} />;
  if (p.workouts === 0) return <TipBox title={p.label} rows={[{ label: "training load", value: "0" }]} note="No workout recorded" />;
  return (
    <TipBox title={p.label}
      rows={[
        { label: "total training load", value: String(p.total) },
        ...(kind !== "strength" ? [{ color: "var(--m-load-run)", label: "running", value: String(p.run) }] : []),
        ...(kind !== "run" ? [{ color: "var(--m-load-strength)", label: "strength", value: String(p.strength) }] : []),
      ]}
      note={p.unscored > 0 ? `${p.unscored} ${p.unscored === 1 ? "workout has" : "workouts have"} no load figure and ${p.unscored === 1 ? "is" : "are"} not counted` : undefined} />
  );
}

export function LoadPerSlotChart({ data, kind }: { data: LoadSlot[]; kind: LoadKind }) {
  const series = [
    ...(kind !== "strength" ? [{ key: "run", name: "Running", color: "var(--m-load-run)" }] : []),
    ...(kind !== "run" ? [{ key: "strength", name: "Strength", color: "var(--m-load-strength)" }] : []),
  ];
  return (
    <Frame label="Columns of training load for each day or week, running and strength added up." legend={series.map((s) => ({ label: s.name, color: s.color, kind: "box" as const }))}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ domain: [0, "auto"] })}
        <Tooltip content={(props) => <LoadSlotTip active={props.active} payload={props.payload as unknown as { payload: LoadSlot }[]} kind={kind} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="load" fill={s.color} stroke={SURFACE} strokeWidth={gapFor(data.length)} maxBarSize={24}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
        ))}
      </ComposedChart>
    </Frame>
  );
}
