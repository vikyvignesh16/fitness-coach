import { CircleCheck, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { ApproveButton } from "@/components/approve-buttons";
import { StatusBanner } from "@/components/status-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadApprovePage } from "@/lib/data";
import { formatKm } from "@/lib/format";
import { runLabel } from "@/lib/labels";
import { dayMonth, weekdayShort } from "@/lib/weeks";

export default async function ApprovePage() {
  const { runs, waiting } = await loadApprovePage(14);
  const waitingDates = runs.filter((r) => r.state === "waiting" && !r.locked).map((r) => r.day.date);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Approve runs</h1>
        <p className="text-muted-foreground text-sm">
          Nothing goes to your watch until you approve it here. The next 14 days.
        </p>
      </div>

      {waiting > 0 && (
        <StatusBanner level="info" title={`${waiting} ${waiting === 1 ? "run is" : "runs are"} waiting for you`}>
          COROS cannot delete a workout once it is sent. Remove one in the COROS app if you need to.
        </StatusBanner>
      )}

      <ul className="space-y-3">
        {runs.map(({ day, state, locked, error }) => (
          <li key={day.date}>
            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-muted-foreground text-sm">{weekdayShort(day.date)} {dayMonth(day.date)}</p>
                    <p className="text-lg font-medium">{runLabel(day.run!.type)} · {formatKm(day.run!.distance_km)}</p>
                    {day.run!.pace_or_effort && <p className="text-muted-foreground text-sm">{day.run!.pace_or_effort}</p>}
                  </div>
                  {state === "sent" && <Badge><CircleCheck aria-hidden className="size-3" /> On your watch</Badge>}
                </div>

                {locked ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Lock aria-hidden className="size-4" /> Locked until the ankle check is passed.{" "}
                    <Link href="/gates/ankle" className="text-foreground underline">Open it</Link>
                  </p>
                ) : state === "waiting" ? (
                  <ApproveButton dates={[day.date]} label="Approve and send to watch" />
                ) : state === "queued" ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Clock aria-hidden className="size-4" /> Approved. Sending to your watch, this takes up to 5 minutes.
                  </p>
                ) : state === "failed" ? (
                  <StatusBanner level="careful" title="Could not send this run">
                    {error}. It will not retry by itself. Tell Claude.
                  </StatusBanner>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {runs.length === 0 && <p className="text-muted-foreground text-sm">No runs planned in the next 14 days.</p>}

      {waitingDates.length > 1 && (
        <ApproveButton dates={waitingDates} label={`Approve all ${waitingDates.length}`} variant="outline" />
      )}
    </>
  );
}
