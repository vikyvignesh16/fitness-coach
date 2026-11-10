import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBanner } from "@/components/status-banner";
import { StrengthSessionCard } from "@/components/strength-session-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadGymDay } from "@/lib/data";
import { dayMonth, weekdayShort } from "@/lib/weeks";

export default async function GymDayPage(props: PageProps<"/gym/[date]">) {
  const { date } = await props.params;
  const data = await loadGymDay(date);
  if (!data) notFound();
  const { day, locked, sessions } = data;

  return (
    <>
      <Link href={day ? `/gym?week=${day.week}` : "/gym"} className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Gym
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{day?.gym?.session ?? sessions[0]?.workout_name ?? "Strength session"}</h1>
        <p className="text-muted-foreground text-sm">{weekdayShort(date)} {dayMonth(date)}</p>
      </div>

      {locked && (
        <StatusBanner level="careful" title="This week is locked">
          Do the four ankle checks first. <Link href="/gates/ankle" className="text-foreground underline">Open the ankle check</Link>
        </StatusBanner>
      )}

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Your watch has not recorded a strength session for this day.</p>
      ) : (
        sessions.map((s) => <StrengthSessionCard key={s.id} session={s} />)
      )}

      {day?.gym && (
        <Card>
          <CardHeader>
            <CardTitle>What the plan said</CardTitle>
            <CardDescription>{day.gym.session}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {day.gym.key_exercises.map((e) => (
                <li key={e.name} className="flex justify-between gap-3">
                  <span>{e.name}</span>
                  <span className="text-muted-foreground">{[e.sets ? `${e.sets} sets` : null, e.reps].filter(Boolean).join(" of ")}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
