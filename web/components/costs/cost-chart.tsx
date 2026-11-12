"use client";

import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_LINE, AXIS_TICK, GRID, gapFor, Legend, TipBox } from "@/components/insights/chart-parts";
import { GROUPS, formatUsd, type Bucket } from "@/lib/costs";

const HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const SURFACE = "var(--card)";

type Tip = { active?: boolean; payload?: { payload: Bucket }[] };

function CostTip({ active, payload }: Tip) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <TipBox
      title={b.label}
      rows={[
        ...GROUPS.filter((g) => b.byGroup[g.key] > 0).map((g) => ({ color: g.color, label: g.label, value: formatUsd(b.byGroup[g.key]) })),
        { label: `in total, ${b.calls} ${b.calls === 1 ? "call" : "calls"}`, value: formatUsd(b.total) },
      ]}
    />
  );
}

/** Axis labels with as many decimals as the biggest bar needs, so neighbouring ticks never read the same. */
export function tickFor(max: number): (v: number) => string {
  const decimals = max >= 1 ? 2 : max >= 0.1 ? 2 : max >= 0.01 ? 3 : 4;
  return (v) => (v === 0 ? "$0" : `$${max >= 1 ? +v.toFixed(2) : v.toFixed(decimals)}`);
}

/** Money spent per day, week or month, stacked by what it was spent on. The same numbers are in the data table below the chart. */
export function CostChart({ data }: { data: Bucket[] }) {
  const tick = tickFor(Math.max(0, ...data.map((b) => b.total)));
  return (
    <figure className="space-y-3">
      <figcaption><Legend items={GROUPS.map((g) => ({ label: g.label, color: g.color, kind: "box" as const }))} /></figcaption>
      <div role="img" aria-label="Stacked columns of the money spent in each period, split into chat, library search, library indexing, and demos and tests. The data table below has the same numbers.">
        <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 360, height: HEIGHT }}>
          <ComposedChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={24} />
            <YAxis width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} domain={[0, "auto"]} tickFormatter={tick} />
            <Tooltip content={<CostTip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            {GROUPS.map((g, i) => (
              <Bar key={g.key} dataKey={`byGroup.${g.key}`} name={g.label} stackId="cost" fill={g.color} stroke={SURFACE} strokeWidth={gapFor(data.length)}
                maxBarSize={24} radius={i === GROUPS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
