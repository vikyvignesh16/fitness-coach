import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachingNotes } from "@/lib/types";

const FIELDS: { key: keyof CoachingNotes; label: string }[] = [
  { key: "before", label: "Before" },
  { key: "during", label: "During" },
  { key: "after", label: "After" },
  { key: "next_24_48h", label: "Next 24 to 48 hours" },
  { key: "stop_or_modify", label: "Stop or change the plan if" },
  { key: "heart_rate", label: "Heart rate" },
];

/** Guidance for the day, from the plan. Web only: it is never sent to the watch or the calendar. */
export function CoachingNotesCard({ notes }: { notes: CoachingNotes | null | undefined }) {
  const rows = FIELDS.filter((f) => notes?.[f.key]?.trim());
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coaching notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rows.map((f) => (
          <div key={f.key}>
            <p className="font-medium">{f.label}</p>
            <p className="text-muted-foreground">{notes![f.key]}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
