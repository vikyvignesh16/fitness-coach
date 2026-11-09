import { KpiCard } from "@/components/insights/kpi-card";
import { RangeControls } from "@/components/insights/range-controls";
import { loadInsights } from "@/lib/data";
import { buildKpis } from "@/lib/insights-kpis";
import { parseInsightsRange } from "@/lib/insights-range";
import { todayLocal } from "@/lib/weeks";

// The four sections of the spec. The charts inside them arrive in the next step.
const SECTIONS = [
  { title: "Sleep and recovery", note: "Sleep, HRV, resting heart rate, stress and recovery." },
  { title: "Training load and volume", note: "Weekly distance, training load, short-term against long-term load, long runs." },
  { title: "Running fitness", note: "VO2max, threshold pace, marathon prediction and running efficiency." },
  { title: "Workout history and insights", note: "Your workouts with notes, and how recovery and training relate." },
];

export default async function InsightsPage(props: PageProps<"/insights">) {
  const today = todayLocal();
  const range = parseInsightsRange(await props.searchParams, today);
  const { kpiRows, rows, snapshot } = await loadInsights(range, today);
  const kpis = buildKpis(kpiRows, snapshot, today);
  const daysWithData = rows.filter((r) => r.day >= range.from && r.day <= range.to).length;

  return (
    <>
      <h1 className="text-xl font-semibold">Insights</h1>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
      </section>

      <RangeControls range={range} today={today} />
      <p className="text-muted-foreground text-xs">{daysWithData} of {range.days} days in this range have watch data.</p>

      {SECTIONS.map((s) => (
        <section key={s.title} aria-label={s.title} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="text-muted-foreground text-sm">{s.note}</p>
          </div>
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">The charts for this section arrive in the next step.</p>
        </section>
      ))}

      <p className="text-muted-foreground text-xs">Watch numbers are estimates and this is not medical advice. Persistent pain means stop and see a professional.</p>
    </>
  );
}
