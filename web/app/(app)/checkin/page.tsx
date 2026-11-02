import { CheckinForm, type CheckinInitial } from "@/components/checkin-form";
import { StatusBanner } from "@/components/status-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCheckinPage } from "@/lib/data";
import { dayMonth } from "@/lib/weeks";

export default async function CheckinPage() {
  const { userId, weekStart, current, history, photoUrls, stopMessage } = await loadCheckinPage();

  const initial: CheckinInitial = {
    weightKg: current?.morning_weight_kg != null ? String(current.morning_weight_kg) : "",
    // Height rarely changes, so offer the last one entered.
    heightCm: String(current?.height_cm ?? history.find((c) => c.height_cm != null)?.height_cm ?? ""),
    feeling: current?.feeling ?? "",
    painScore: current?.pain_score ?? 0,
    painRepeated: current?.pain_repeated ?? false,
    painLastedHours: current && current.pain_lasted_hours > 0 ? String(current.pain_lasted_hours) : "",
    painWorseNextMorning: current?.pain_worse_next_morning ?? false,
    flags: current?.pain_flags ?? [],
  };
  const past = history.filter((c) => c.week_start !== weekStart);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Weekly check in</h1>
        <p className="text-muted-foreground text-sm">Week of {dayMonth(weekStart)}. You can change it until the week ends. This is not medical advice.</p>
      </div>

      {stopMessage && <StatusBanner level="stop" title="Your last check in says stop">{stopMessage}</StatusBanner>}

      <Card>
        <CardContent>
          <CheckinForm userId={userId} weekStart={weekStart} initial={initial} savedPhotos={photoUrls} />
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Earlier weeks</CardTitle>
            <CardDescription>Weight and pain for each check in.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {past.map((c) => (
                <li key={c.week_start} className="flex items-center justify-between py-3">
                  <span>{dayMonth(c.week_start)}</span>
                  <span className="tabular-nums">{c.morning_weight_kg ?? "-"} kg · pain {c.pain_score}{c.pain_stop ? " · stop" : ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
