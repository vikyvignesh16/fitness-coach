"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AXIS_LINE, AXIS_TICK, TipBox } from "@/components/insights/chart-parts";
import { EFFORT_SCALE, type EffortHrvPoint, type LoadHrvPoint } from "@/lib/insights-scatter";

const HEIGHT = 260;
const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };
const SURFACE = "var(--card)";
type Tip<T> = { active?: boolean; payload?: { payload: T }[] };

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure>
      <div role="img" aria-label={`${label} The data table below has the same numbers.`}>
        <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 360, height: HEIGHT }}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

const dot = (props: { cx?: number; cy?: number }) =>
  props.cx === undefined || props.cy === undefined ? <g /> : <circle cx={props.cx} cy={props.cy} r={5} fill="var(--m-hrv)" fillOpacity={0.85} stroke={SURFACE} strokeWidth={2} />;

function LoadHrvTip({ active, payload }: Tip<LoadHrvPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TipBox title={p.label + (p.rest ? " (rest day)" : "")}
      rows={[
        { color: "var(--m-hrv)", label: "training load", value: String(p.load) },
        { label: "next morning HRV", value: `${p.hrv} ms` },
      ]}
      note={`${Math.abs(p.deviation)} ms ${p.deviation >= 0 ? "above" : "below"} the COROS baseline of ${p.baseline} ms`} />
  );
}

export function LoadHrvChart({ data }: { data: LoadHrvPoint[] }) {
  return (
    <Frame label="Scatter plot. Each dot is a day. Training load runs along the bottom, and up the side is how far the next morning's HRV was from the COROS baseline, with a dashed line at zero.">
      <ScatterChart margin={MARGIN}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis type="number" dataKey="load" name="Training load" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} domain={[0, "auto"]} allowDecimals={false} />
        <YAxis type="number" dataKey="deviation" name="HRV difference" unit=" ms" width={52} tickLine={false} axisLine={false} tick={AXIS_TICK} domain={["auto", "auto"]} allowDecimals={false} />
        <ZAxis range={[60, 60]} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="5 4" />
        <Tooltip content={<LoadHrvTip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }} />
        <Scatter data={data} shape={dot} isAnimationActive={false} />
      </ScatterChart>
    </Frame>
  );
}

function EffortTip({ active, payload }: Tip<EffortHrvPoint>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <TipBox title={`${p.title}, ${p.label}`} rows={[{ color: "var(--m-hrv)", label: "HRV that morning", value: `${p.hrv} ms` }, { label: "how it felt", value: p.word }]} />;
}

export function EffortHrvChart({ data }: { data: EffortHrvPoint[] }) {
  return (
    <Frame label="Scatter plot. Each dot is a workout. How it felt runs along the bottom from Very Easy to Very Hard, and up the side is your HRV that morning.">
      <ScatterChart margin={MARGIN}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis type="number" dataKey="effort" name="How it felt" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]}
          tickFormatter={(v: number) => EFFORT_SCALE[v - 1] ?? ""} interval={0} />
        <YAxis type="number" dataKey="hrv" name="HRV" unit=" ms" width={52} tickLine={false} axisLine={false} tick={AXIS_TICK} domain={["auto", "auto"]} allowDecimals={false} />
        <ZAxis range={[60, 60]} />
        <Tooltip content={<EffortTip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }} />
        <Scatter data={data} shape={dot} isAnimationActive={false} />
      </ScatterChart>
    </Frame>
  );
}
