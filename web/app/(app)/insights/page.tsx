import { ChartCard } from "@/components/insights/chart-card";
import {
  HrvChart, LoadChart, RestingHrChart, SleepCompositionChart, SleepScoreChart, VolumeChart,
} from "@/components/insights/charts";
import { HowToRead } from "@/components/insights/how-to-read";
import { KpiCard } from "@/components/insights/kpi-card";
import { RangeControls } from "@/components/insights/range-controls";
import { loadInsights, loadRuns } from "@/lib/data";
import { buildKpis } from "@/lib/insights-kpis";
import { parseInsightsRange } from "@/lib/insights-range";
import {
  buildSlots, hrvSeries, loadSeries, restingHrSeries, sleepComposition, sleepScore, weeklyVolume,
} from "@/lib/insights-series";
import { hrvTable, loadTable, rhrTable, scoreTable, sleepTable, volumeTable } from "@/lib/insights-tables";
import { todayLocal } from "@/lib/weeks";

// Sections that still wait for their charts (the later steps of the plan).
const LATER = [
  { title: "Running fitness", note: "VO2max, threshold pace, marathon prediction and running efficiency." },
  { title: "Workout history and insights", note: "Your workouts with notes, and how recovery and training relate." },
];

const SectionHead = ({ title, note }: { title: string; note: string }) => (
  <div>
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="text-muted-foreground text-sm">{note}</p>
  </div>
);

export default async function InsightsPage(props: PageProps<"/insights">) {
  const today = todayLocal();
  const range = parseInsightsRange(await props.searchParams, today);
  const [{ kpiRows, rows, snapshot }, runs] = await Promise.all([loadInsights(range, today), loadRuns()]);
  const kpis = buildKpis(kpiRows, snapshot, today);
  const daysWithData = rows.filter((r) => r.day >= range.from && r.day <= range.to).length;

  const { view } = range;
  const slots = buildSlots(range, view);
  const sleep = sleepComposition(rows, slots);
  const score = sleepScore(rows, slots, view);
  const hrv = hrvSeries(rows, slots, view);
  const rhr = restingHrSeries(rows, slots, view);
  const load = loadSeries(rows, slots);
  const volume = weeklyVolume(runs, range, today);
  const unit = view === "daily" ? "night" : "week";

  return (
    <>
      <h1 className="text-xl font-semibold">Insights</h1>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
      </section>

      <HowToRead />

      <RangeControls range={range} today={today} />
      <p className="text-muted-foreground text-xs">{daysWithData} of {range.days} days in this range have watch data.</p>

      <section aria-label="Sleep and recovery" className="space-y-3">
        <SectionHead title="Sleep and recovery" note="Sleep, HRV and resting heart rate. Recovery and stress charts come later." />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sleep stages" purpose={`How long you slept each ${unit}, and how it splits into deep, REM, light and awake.`}
            hasData={sleep.some((p) => p.asleepMin !== null || p.deep !== null)} table={sleepTable(sleep, view)}>
            <SleepCompositionChart data={sleep} />
          </ChartCard>
          <ChartCard title="Sleep score" purpose="The COROS score for each night against your own 28 day average."
            hasData={score.some((p) => p.score !== null)} table={scoreTable(score, view)}>
            <SleepScoreChart data={score} />
          </ChartCard>
          <ChartCard title="HRV" purpose="Is your nightly HRV inside your normal range, and which way is it heading?"
            hasData={hrv.some((p) => p.hrv !== null)} table={hrvTable(hrv, view)}>
            <HrvChart data={hrv} />
          </ChartCard>
          <ChartCard title="Resting heart rate" purpose="A resting heart rate that stays above your own average can mean your body is working harder."
            hasData={rhr.some((p) => p.rhr !== null)} table={rhrTable(rhr, view)}>
            <RestingHrChart data={rhr} />
          </ChartCard>
        </div>
      </section>

      <section aria-label="Training load and volume" className="space-y-3">
        <SectionHead title="Training load and volume" note="Weekly distance and COROS training load. Long runs come later." />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Weekly running distance" purpose="Kilometres per week from your watch runs, with the 4 week average."
            hasData={volume.some((p) => p.km > 0)} table={volumeTable(volume)}>
            <VolumeChart data={volume} />
          </ChartCard>
          <ChartCard title="Short-term and long-term load" purpose="Is recent training heavier or lighter than what you are used to? COROS keeps about 30 days of this."
            hasData={load.some((p) => p.short !== null || p.long !== null)} table={loadTable(load, view)}>
            <LoadChart data={load} />
          </ChartCard>
        </div>
      </section>

      {LATER.map((s) => (
        <section key={s.title} aria-label={s.title} className="space-y-3">
          <SectionHead title={s.title} note={s.note} />
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">The charts for this section arrive in a later step.</p>
        </section>
      ))}

      <p className="text-muted-foreground text-xs">Watch numbers are estimates and this is not medical advice. Persistent pain means stop and see a professional.</p>
    </>
  );
}
