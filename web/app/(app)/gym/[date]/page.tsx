import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StrengthSessionCard } from "@/components/strength-session-card";
import { loadGymDay } from "@/lib/data";
import { dayMonth, mondayOf, weekdayShort } from "@/lib/weeks";

export default async function GymDayPage(props: PageProps<"/gym/[date]">) {
  const { date } = await props.params;
  const sessions = await loadGymDay(date);
  if (!sessions) notFound();

  return (
    <>
      <Link href={`/gym?week=${mondayOf(date)}`} className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Gym
      </Link>
      <h1 className="text-xl font-semibold">{weekdayShort(date)} {dayMonth(date)}</h1>
      {sessions.map((s) => <StrengthSessionCard key={s.id} session={s} />)}
    </>
  );
}
