"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeekPoint } from "@/lib/types";
import { formatKm } from "@/lib/format";

const PLANNED = "var(--series-planned)";
const ACTUAL = "var(--series-actual)";

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: color }} />;
}

function ReadoutRow({ color, label, km }: { color: string; label: string; km: number }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: color }} />
      <span className="font-semibold">{formatKm(km)}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function Readout({ active, payload }: { active?: boolean; payload?: { payload: WeekPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">Week {p.week} · {p.phase}</div>
      <ReadoutRow color={PLANNED} label="Planned" km={p.plannedKm} />
      <ReadoutRow color={ACTUAL} label="Done" km={p.actualKm} />
    </div>
  );
}

export function WeeklyChart({ data }: { data: WeekPoint[] }) {
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-2"><Swatch color={PLANNED} /> Planned</span>
        <span className="flex items-center gap-2"><Swatch color={ACTUAL} /> Done</span>
      </figcaption>
      <div role="img" aria-label="Weekly distance in kilometres, planned and done, for each week of the plan. The table below has the same numbers.">
        <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 360, height: 220 }}>
          <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={1}
            />
            <YAxis
              width={32}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <Tooltip content={<Readout />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            <Bar dataKey="plannedKm" name="Planned" fill={PLANNED} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="actualKm" name="Done" fill={ACTUAL} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="py-1 pr-3 font-normal">Week</th>
                <th className="py-1 pr-3 font-normal">Phase</th>
                <th className="py-1 pr-3 text-right font-normal">Planned km</th>
                <th className="py-1 text-right font-normal">Done km</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.week} className="border-b last:border-b-0">
                  <td className="py-1 pr-3">{p.week}</td>
                  <td className="py-1 pr-3">{p.phase}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{p.plannedKm}</td>
                  <td className="py-1 text-right tabular-nums">{p.actualKm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
