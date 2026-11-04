import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatKm, formatPace } from "@/lib/format";
import { isRestDay, runLabel } from "@/lib/labels";
import { dayMonth, weekdayShort } from "@/lib/weeks";
import type { DayActual, PlanDay } from "@/lib/types";

export function DayRow({
  day,
  actual,
  locked,
  today,
}: {
  day: PlanDay;
  actual?: DayActual;
  locked: boolean;
  today?: boolean;
}) {
  const runType = day.run?.type;
  const rest = isRestDay(runType);
  const gym = day.gym?.session;

  return (
    <li
      className={`border-b last:border-b-0 ${today ? "bg-muted/50 -mx-4 px-4" : ""}`}
      aria-current={today ? "date" : undefined}
    >
      <Link href={`/plan/${day.date}`} className="flex gap-3 py-3">
      <div className="w-14 shrink-0">
        <div className="font-medium">{weekdayShort(day.date)}</div>
        <div className="text-muted-foreground text-xs">{dayMonth(day.date)}</div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {locked ? (
          <p className="text-muted-foreground text-sm">Locked until the ankle check is passed.</p>
        ) : (
          <>
            <p className="text-sm">
              {rest ? (
                <span className="text-muted-foreground">Rest from running</span>
              ) : (
                <>
                  <span className="font-medium">{runLabel(runType!)}</span>{" "}
                  <span>{formatKm(day.run!.distance_km)}</span>
                </>
              )}
            </p>
            {actual && (
              <p className="text-sm">
                <Badge variant="secondary" className="mr-2">Done</Badge>
                {formatKm(actual.distanceKm)} in {formatDuration(actual.durationS)}, {formatPace(actual.distanceKm, actual.durationS)}
                {actual.avgHr != null && <>, {actual.avgHr} bpm</>}
              </p>
            )}
            {gym && gym !== "unverified" && <p className="text-muted-foreground text-sm">Gym: {gym}</p>}
          </>
        )}
      </div>
      </Link>
    </li>
  );
}
