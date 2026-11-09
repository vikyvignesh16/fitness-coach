import { Card, CardContent } from "@/components/ui/card";
import type { Kpi } from "@/lib/insights-kpis";

/** One of the six cards at the top of Insights. Missing data says so; it is never shown as zero. */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <Card size="sm" data-kpi={kpi.id}>
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-xs">{kpi.label}</p>
        {kpi.value === null ? (
          <p className="text-muted-foreground text-lg font-medium">No data yet</p>
        ) : (
          <p className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums">{kpi.value}</span>
            {kpi.unit && <span className="text-muted-foreground text-xs">{kpi.unit}</span>}
          </p>
        )}
        {kpi.value !== null && kpi.lines.map((line) => (
          <p key={line} className="text-xs leading-snug">{line}</p>
        ))}
        {kpi.measured && (
          <p className={`text-xs ${kpi.stale ? "text-amber-400" : "text-muted-foreground"}`}>
            {kpi.stale ? "Older: " : ""}{kpi.measured}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
