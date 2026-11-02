import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExerciseCard } from "@/components/exercise-card";
import { FinishWorkoutButton } from "@/components/finish-workout-button";
import { StatusBanner } from "@/components/status-banner";
import { loadGymSession } from "@/lib/data";
import { buildSetRows, exerciseDone, lastPerformance, sessionProgress, sessionTotals } from "@/lib/gym";
import { dayMonth, weekdayShort } from "@/lib/weeks";

export default async function GymSessionPage(props: PageProps<"/gym/[date]">) {
  const { date } = await props.params;
  const data = await loadGymSession(date);
  if (!data) notFound();

  const { day, locked, logged, history, finished } = data;
  const exercises = day.gym!.key_exercises;
  const progress = sessionProgress(exercises, logged);
  const totals = sessionTotals(logged);
  const firstOpen = exercises.findIndex((e) => !exerciseDone(e, logged));

  return (
    <>
      <Link href={`/gym?week=${day.week}`} className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Gym
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{day.gym!.session}</h1>
        <p className="text-muted-foreground text-sm">
          {weekdayShort(date)} {dayMonth(date)} · {progress.done} of {progress.total} exercises done
        </p>
      </div>

      {locked && (
        <StatusBanner level="careful" title="This week is locked">
          Do the four ankle checks first. <Link href="/gates/ankle" className="text-foreground underline">Open the ankle check</Link>
        </StatusBanner>
      )}
      {finished && (
        <StatusBanner level="good" title="Workout finished">
          {totals.setsDone} sets done, {totals.volumeKg.toLocaleString("en-GB")} kg lifted in total.
        </StatusBanner>
      )}

      <div className="space-y-3">
        {exercises.map((exercise, i) => (
          <ExerciseCard
            key={exercise.name}
            date={date}
            exercise={exercise}
            initialRows={buildSetRows(exercise, logged)}
            last={lastPerformance(history, exercise.name, date)}
            disabled={locked}
            defaultOpen={i === firstOpen}
          />
        ))}
      </div>

      <FinishWorkoutButton date={date} disabled={locked} />
    </>
  );
}
