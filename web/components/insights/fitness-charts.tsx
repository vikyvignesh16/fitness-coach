"use client";

import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { AXIS_LINE, AXIS_TICK, GRID, Legend, TipBox } from "@/components/insights/chart-parts";
import { describeGap, formatHms, formatPace, gapsToGoals, type EfficiencyPoint, type FitnessPoint, type Goal, type LongRunPoint, type MonthGroup } from "@/lib/insights-fitness";

const HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const SURFACE = "var(--card)";

/** Axis limits rounded to a clean step, so ticks read 3:00:00 and 3:05:00 and not 3:07:41. */
const nice = (step: number, pad: number): [(min: number) => number, (max: number) => number] => [
  (min) => Math.floor((min - pad) / step) * step,
  (max) => Math.ceil((max + pad) / step) * step,
];
const NEUTRAL = "var(--muted-foreground)";
type Tip<T> = { active?: boolean; payload?: { payload: T }[] };

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
const yAxis = (props: React.ComponentProps<typeof YAxis> = {}) => <YAxis width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} {...props} />;

function dotFor<T extends { isolated: boolean }>(color: string) {
  function Dot(props: { cx?: number; cy?: number; index?: number; payload?: T }) {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || !payload?.isolated) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />;
  }
  return Dot;
}
const activeDot = (color: string) => ({ r: 5, fill: color, stroke: SURFACE, strokeWidth: 2 });

// ---- 10. Long run progression ----
function LongRunTip({ active, payload }: Tip<LongRunPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.km === null) return <TipBox title={`Week of ${p.label}`} rows={[{ label: "long run", value: "no run this week" }]} />;
  return (
    <TipBox title={`Week of ${p.label}`}
      rows={[
        { color: "var(--m-volume)", label: "km, longest run", value: String(p.km) },
        ...(p.durationS !== null ? [{ label: "time", value: formatHms(p.durationS) }] : []),
        ...(p.paceS !== null ? [{ label: "min/km average pace", value: formatPace(p.paceS) }] : []),
        ...(p.avgHr !== null ? [{ label: "bpm average heart rate", value: String(p.avgHr) }] : []),
      ]}
      note={`${p.runsThatWeek} ${p.runsThatWeek === 1 ? "run" : "runs"} that week`} />
  );
}

export function LongRunChart({ data }: { data: LongRunPoint[] }) {
  return (
    <Frame label="Columns of the longest run in kilometres for each week.">
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ domain: [0, "auto"], width: 40 })}
        <Tooltip content={<LongRunTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        <Bar dataKey="km" fill="var(--m-volume)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 11 and 12. VO2max and threshold pace ----
function Vo2Tip({ active, payload }: Tip<FitnessPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <TipBox title={p.label} rows={[{ color: "var(--m-vo2)", label: "VO2max", value: p.vo2max === null ? "no data" : String(p.vo2max) }]} />;
}

export function Vo2Chart({ data }: { data: FitnessPoint[] }) {
  return (
    <Frame label="Line chart of VO2max over time.">
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ domain: nice(1, 1), width: 40, allowDecimals: false })}
        <Tooltip content={<Vo2Tip />} />
        <Line dataKey="vo2max" stroke="var(--m-vo2)" strokeWidth={2} strokeLinecap="round" dot={dotFor<FitnessPoint>("var(--m-vo2)")} activeDot={activeDot("var(--m-vo2)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

function ThresholdTip({ active, payload }: Tip<FitnessPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <TipBox title={p.label} rows={[{ color: "var(--m-threshold)", label: "min/km threshold pace", value: p.thresholdS === null ? "no data" : formatPace(p.thresholdS) }]} />;
}

export function ThresholdChart({ data }: { data: FitnessPoint[] }) {
  return (
    <Frame label="Line chart of threshold pace in minutes and seconds per kilometre. Faster paces are higher up.">
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ reversed: true, domain: nice(10, 5), tickFormatter: (v: number) => formatPace(v), allowDecimals: false })}
        <Tooltip content={<ThresholdTip />} />
        <Line dataKey="thresholdS" stroke="var(--m-threshold)" strokeWidth={2} strokeLinecap="round" dot={dotFor<FitnessPoint>("var(--m-threshold)")} activeDot={activeDot("var(--m-threshold)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 13. Marathon prediction ----
function MarathonTip({ active, payload, goals }: Tip<FitnessPoint> & { goals: Goal[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.marathonS === null) return <TipBox title={p.label} rows={[{ label: "marathon prediction", value: "no data" }]} />;
  return (
    <TipBox title={p.label} rows={[{ color: "var(--m-marathon)", label: "COROS marathon prediction", value: formatHms(p.marathonS) }]}
      note={<>{gapsToGoals(p.marathonS, goals).map((g) => <span key={g.name} className="block">Goal {g.name} ({g.label}): {describeGap(g.gapS)}</span>)}</>} />
  );
}

/** Limits and ticks every 10 minutes that cover the prediction line and all three goals. */
export function marathonAxis(data: FitnessPoint[], goals: Goal[]): { domain: [number, number]; ticks: number[] } {
  const values = [...data.map((p) => p.marathonS).filter((v): v is number => v !== null), ...goals.map((g) => g.seconds)];
  const lo = Math.floor((Math.min(...values) - 120) / 600) * 600;
  const hi = Math.ceil((Math.max(...values) + 120) / 600) * 600;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 600) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

export function MarathonChart({ data, goals }: { data: FitnessPoint[]; goals: Goal[] }) {
  const axis = marathonAxis(data, goals);
  return (
    <Frame label="Line chart of the COROS marathon prediction with dashed lines for the A, B and C goals. Faster times are higher up."
      legend={[
        { label: "COROS marathon prediction", color: "var(--m-marathon)", kind: "line" },
        { label: "Your goals", color: NEUTRAL, kind: "dash" },
      ]}>
      <ComposedChart data={data} margin={{ ...MARGIN, right: 40 }}>
        <CartesianGrid {...GRID} />
        {xAxis}
        {yAxis({ reversed: true, domain: axis.domain, ticks: axis.ticks, tickFormatter: (v: number) => formatHms(v), width: 56, allowDecimals: false })}
        <Tooltip content={(props) => <MarathonTip active={props.active} payload={props.payload as unknown as { payload: FitnessPoint }[]} goals={goals} />} />
        {goals.map((g) => (
          <ReferenceLine key={g.name} y={g.seconds} stroke={NEUTRAL} strokeDasharray="5 4"
            label={{ value: `${g.name} ${g.label}`, position: "right", fill: NEUTRAL, fontSize: 11 }} />
        ))}
        <Line dataKey="marathonS" stroke="var(--m-marathon)" strokeWidth={2} strokeLinecap="round" dot={dotFor<FitnessPoint>("var(--m-marathon)")} activeDot={activeDot("var(--m-marathon)")} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
}

// ---- 14. Running efficiency ----
const GROUPS: Record<MonthGroup, { color: string; shape: "circle" | "square" | "triangle" | "ring"; name: (d: Date) => string }> = {
  this: { color: "var(--m-month-0)", shape: "circle", name: (d) => monthName(d, 0) },
  last: { color: "var(--m-month-1)", shape: "square", name: (d) => monthName(d, -1) },
  before: { color: "var(--m-month-2)", shape: "triangle", name: (d) => monthName(d, -2) },
  earlier: { color: NEUTRAL, shape: "ring", name: () => "Earlier" },
};
const monthName = (d: Date, shift: number) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 1)));

function Marker({ cx, cy, group }: { cx?: number; cy?: number; group: MonthGroup }) {
  if (cx === undefined || cy === undefined) return <g />;
  const { color, shape } = GROUPS[group];
  const ring = { stroke: SURFACE, strokeWidth: 2 };
  if (shape === "square") return <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} rx={1} fill={color} {...ring} />;
  if (shape === "triangle") return <polygon points={`${cx},${cy - 5.5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`} fill={color} {...ring} />;
  if (shape === "ring") return <circle cx={cx} cy={cy} r={4.5} fill="none" stroke={color} strokeWidth={1.75} />;
  return <circle cx={cx} cy={cy} r={4.5} fill={color} {...ring} />;
}

function EffTip({ active, payload }: Tip<EfficiencyPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TipBox title={p.label}
      rows={[
        { color: GROUPS[p.group].color, label: "km", value: String(p.km) },
        { label: "min/km pace", value: formatPace(p.paceS) },
        { label: "bpm average heart rate", value: String(p.hr) },
      ]} />
  );
}

export function EfficiencyChart({ data, today }: { data: EfficiencyPoint[]; today: string }) {
  const now = new Date(`${today}T00:00:00Z`);
  const present = (Object.keys(GROUPS) as MonthGroup[]).filter((g) => data.some((p) => p.group === g));
  return (
    <Frame label="Scatter plot of easy runs. Average heart rate runs along the bottom and pace up the side, with faster paces higher up. Each dot is one run."
      legend={present.map((g) => ({ label: GROUPS[g].name(now), color: GROUPS[g].color, kind: GROUPS[g].shape === "ring" ? ("ring" as const) : ("box" as const) }))}>
      <ScatterChart margin={{ ...MARGIN, right: 16 }}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis type="number" dataKey="hr" name="Average heart rate" unit=" bpm" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} domain={nice(5, 3)} allowDecimals={false} />
        <YAxis type="number" dataKey="paceS" name="Pace" reversed width={48} tickLine={false} axisLine={false} tick={AXIS_TICK}
          domain={nice(30, 15)} tickFormatter={(v: number) => formatPace(v)} allowDecimals={false} />
        <ZAxis range={[60, 60]} />
        <Tooltip content={<EffTip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }} />
        {present.map((g) => (
          <Scatter key={g} data={data.filter((p) => p.group === g)} isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => <Marker cx={props.cx} cy={props.cy} group={g} />} />
        ))}
      </ScatterChart>
    </Frame>
  );
}
