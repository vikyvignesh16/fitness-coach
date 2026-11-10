import { RecoveryChart, RecoveryToday, StressChart, LoadPerSlotChart } from "@/components/insights/activity-charts";
import { LoadKindFilter } from "@/components/insights/load-kind-filter";
import { ChartCard } from "@/components/insights/chart-card";
import {
  HrvChart, LoadChart, RestingHrChart, SleepCompositionChart, SleepScoreChart, VolumeChart,
} from "@/components/insights/charts";
import { EfficiencyFilter } from "@/components/insights/efficiency-filter";
import { EfficiencyChart, LongRunChart, MarathonChart, ThresholdChart, Vo2Chart } from "@/components/insights/fitness-charts";
import { HowToRead } from "@/components/insights/how-to-read";
import { HOW_TO } from "@/lib/insights-howto";
import { KpiCard } from "@/components/insights/kpi-card";
import { RangeControls } from "@/components/insights/range-controls";
import { loadFitnessContext, loadInsights, loadRuns, loadStrength } from "@/lib/data";
import { efficiencyPoints, fitnessSeries, goalsFromTargets, longRunPerWeek } from "@/lib/insights-fitness";
import { buildKpis } from "@/lib/insights-kpis";
import { parseInsightsRange } from "@/lib/insights-range";
import {
  buildSlots, hrvSeries, intradayPoints, loadPerSlot, loadSeries, recoverySeries, restingHrSeries, sleepComposition, sleepScore, stressSeries, weeklyVolume,
} from "@/lib/insights-series";
import { efficiencyTable, fitnessTable, hrvTable, loadPerSlotTable, loadTable, longRunTable, recoveryTable, rhrTable, scoreTable, sleepTable, stressTable, volumeTable } from "@/lib/insights-tables";
import { todayLocal } from "@/lib/weeks";

// Sections that still wait for their charts (the later steps of the plan).
const LATER = [
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
  const [{ kpiRows, rows, snapshot, todaySnapshots }, runs, plan, strength] = await Promise.all([loadInsights(range, today), loadRuns(), loadFitnessContext(), loadStrength(range.from, range.to)]);
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
  const longRuns = longRunPerWeek(runs, range);
  const fitness = fitnessSeries(rows, slots);
  const goals = goalsFromTargets(plan.targets);
  const efficiency = efficiencyPoints(runs, plan.planTypes, range, today);
  const stress = stressSeries(rows, slots, view);
  const recovery = recoverySeries(rows, slots, view);
  const intraday = intradayPoints(todaySnapshots, today);
  const loadDays = loadPerSlot(runs, strength, slots, range.loadKind);
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
        <SectionHead title="Sleep and recovery" note="Sleep, HRV, resting heart rate, stress and recovery." />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sleep stages" purpose={`How long you slept each ${unit}, and how it splits into deep, REM, light and awake.`}
            hasData={sleep.some((p) => p.asleepMin !== null || p.deep !== null)} table={sleepTable(sleep, view)} howTo={HOW_TO.sleep}>
            <SleepCompositionChart data={sleep} />
          </ChartCard>
          <ChartCard title="Sleep score" purpose="The COROS score for each night against your own 28 day average."
            hasData={score.some((p) => p.score !== null)} table={scoreTable(score, view)} howTo={HOW_TO.score}>
            <SleepScoreChart data={score} />
          </ChartCard>
          <ChartCard title="HRV" purpose="Is your nightly HRV inside your normal range, and which way is it heading?"
            hasData={hrv.some((p) => p.hrv !== null)} table={hrvTable(hrv, view)} howTo={HOW_TO.hrv}>
            <HrvChart data={hrv} />
          </ChartCard>
          <ChartCard title="Stress" purpose="Your average stress each day against your own usual."
            hasData={stress.some((p) => p.stress !== null)} table={stressTable(stress, view)} howTo={HOW_TO.stress}>
            <StressChart data={stress} />
          </ChartCard>
          <ChartCard title="Recovery status" purpose="How topped up COROS thinks you are. This history began on 9 Nov, because COROS only tells us the current reading."
            hasData={recovery.some((p) => p.last !== null) || intraday.length > 0} table={recoveryTable(recovery, view)} howTo={HOW_TO.recovery}>
            {recovery.some((p) => p.last !== null) ? <RecoveryChart data={recovery} /> : <p className="text-muted-foreground text-sm">No daily history in this range yet.</p>}
            <RecoveryToday data={intraday} />
          </ChartCard>
          <ChartCard title="Resting heart rate" purpose="A resting heart rate that stays above your own average can mean your body is working harder."
            hasData={rhr.some((p) => p.rhr !== null)} table={rhrTable(rhr, view)} howTo={HOW_TO.rhr}>
            <RestingHrChart data={rhr} />
          </ChartCard>
        </div>
      </section>

      <section aria-label="Training load and volume" className="space-y-3">
        <SectionHead title="Training load and volume" note="Weekly distance and COROS training load. Long runs come later." />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Weekly running distance" purpose="Kilometres per week from your watch runs, with the 4 week average."
            hasData={volume.some((p) => p.km > 0)} table={volumeTable(volume)} howTo={HOW_TO.volume}>
            <VolumeChart data={volume} />
          </ChartCard>
          <ChartCard title="Training load" purpose="How hard each day or week was, from COROS's load for every run and gym session."
            hasData={loadDays.some((p) => p.workouts > 0)} table={loadPerSlotTable(loadDays, view)} howTo={HOW_TO.loadday} controls={<LoadKindFilter range={range} />}>
            <LoadPerSlotChart data={loadDays} kind={range.loadKind} />
          </ChartCard>
          <ChartCard title="Longest run each week" purpose="Is your long run building up steadily, or jumping?"
            hasData={longRuns.some((p) => p.km !== null)} table={longRunTable(longRuns)} howTo={HOW_TO.longrun}>
            <LongRunChart data={longRuns} />
          </ChartCard>
          <ChartCard title="Short-term and long-term load" purpose="Is recent training heavier or lighter than what you are used to? COROS keeps about 30 days of this."
            hasData={load.some((p) => p.short !== null || p.long !== null)} table={loadTable(load, view)} howTo={HOW_TO.load}>
            <LoadChart data={load} />
          </ChartCard>
        </div>
      </section>

      <section aria-label="Running fitness" className="space-y-3">
        <SectionHead title="Running fitness" note="VO2max, threshold pace and marathon prediction start filling in from the day the app began saving them." />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="VO2max" purpose="Your aerobic fitness, as COROS estimates it." hasData={fitness.some((p) => p.vo2max !== null)} table={fitnessTable(fitness, view)} howTo={HOW_TO.vo2}>
            <Vo2Chart data={fitness} />
          </ChartCard>
          <ChartCard title="Threshold pace" purpose="The pace you can hold for a long hard effort. Faster is higher up." hasData={fitness.some((p) => p.thresholdS !== null)} table={fitnessTable(fitness, view)} howTo={HOW_TO.threshold}>
            <ThresholdChart data={fitness} />
          </ChartCard>
          <ChartCard title="Marathon prediction" purpose="COROS's predicted marathon time against your A, B and C goals." hasData={fitness.some((p) => p.marathonS !== null)} table={fitnessTable(fitness, view)} howTo={HOW_TO.marathon}>
            <MarathonChart data={fitness} goals={goals} />
          </ChartCard>
          <ChartCard title="Running efficiency" purpose="Are you getting faster at the same effort? Only easy runs are shown. Wrist heart rate can be off, so this sharpens as chest strap runs arrive."
            hasData={efficiency.length > 0} table={efficiencyTable(efficiency)} howTo={HOW_TO.efficiency} controls={<EfficiencyFilter range={range} />}>
            <EfficiencyChart data={efficiency} today={today} />
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
