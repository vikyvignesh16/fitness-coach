import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSessionTime, sessionTotals, summariseSets } from "@/lib/strength";
import type { StrengthSession } from "@/lib/types";

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

/** One strength session as the watch recorded it: the numbers, your note, and every exercise with its sets. */
export function StrengthSessionCard({ session }: { session: StrengthSession }) {
  const groups = summariseSets(session.sets);
  const totals = sessionTotals(session.sets);
  const facts: [string, string][] = [];
  const add = (label: string, value: string | null) => { if (value !== null) facts.push([label, value]); };
  add("Time", session.duration_s === null ? null : formatSessionTime(session.duration_s));
  add("Sets", session.sets.length ? String(totals.sets) : session.sets_count === null ? null : String(session.sets_count));
  add("Weight lifted", totals.volumeKg > 0 ? `${totals.volumeKg.toLocaleString("en-GB")} kg` : null);
  add("Heart rate", session.avg_hr === null ? null : `${session.avg_hr} bpm`);
  add("Calories", session.calories === null ? null : `${session.calories} kcal`);
  add("Training load", session.training_load === null ? null : String(session.training_load));
  add("How it felt", session.perceived_effort);
  add("Focus", session.training_focus);
  const note = session.workout_note?.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{session.workout_name ?? "Strength session"}</CardTitle>
        <CardDescription>Recorded by your watch, started {time(session.started_at)}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {facts.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {note && (
          <div>
            <p className="text-muted-foreground">Your note</p>
            <p className="whitespace-pre-line">{note}</p>
          </div>
        )}
        {groups.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1">Exercises</p>
            <ul className="divide-y">
              {groups.map((g, i) => (
                <li key={`${g.exercise}-${i}`} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{g.exercise}</span>
                    {g.volumeKg > 0 && <span className="text-muted-foreground text-xs tabular-nums">{g.volumeKg.toLocaleString("en-GB")} kg total</span>}
                  </div>
                  <p className="text-muted-foreground">{g.lines.join(" · ")}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No exercise detail was recorded for this session.</p>
        )}
      </CardContent>
    </Card>
  );
}
