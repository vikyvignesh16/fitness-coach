import { Check, Dumbbell, Lock } from "lucide-react";
import Link from "next/link";
import type { CalendarCell } from "@/lib/calendar";
import { formatKm } from "@/lib/format";
import { runLabel } from "@/lib/labels";
import { dayMonth, weekdayShort } from "@/lib/weeks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One sentence for screen readers, since the cell itself is just numbers and icons. */
export function cellLabel(c: CalendarCell): string {
  const parts = [`${weekdayShort(c.date)} ${dayMonth(c.date)}`];
  if (c.locked) parts.push("locked until the ankle check is passed");
  else if (c.plannedKm != null) parts.push(`${runLabel(c.runType!)} ${formatKm(c.plannedKm)} planned`);
  else if (c.inPlan) parts.push("rest from running");
  if (c.doneKm != null) parts.push(`${formatKm(c.doneKm)} done`);
  if (c.gym && !c.locked) parts.push("gym session");
  return parts.join(", ");
}

function Cell({ c }: { c: CalendarCell }) {
  const km = (n: number) => Number(n.toFixed(1));
  const body = (
    <>
      <span className={`text-xs tabular-nums ${c.today ? "font-bold" : "text-muted-foreground"}`}>
        {Number(c.date.slice(8))}
      </span>
      {c.locked ? (
        <Lock aria-hidden className="text-muted-foreground size-3" />
      ) : (
        <>
          {c.plannedKm != null && (
            <span className="flex items-center gap-1 text-xs font-medium tabular-nums">
              <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ background: "var(--series-planned)" }} />
              {km(c.plannedKm)}
            </span>
          )}
          {c.doneKm != null && (
            <span className="flex items-center gap-0.5 text-xs font-medium tabular-nums">
              <Check aria-hidden className="size-3 shrink-0" style={{ color: "var(--series-actual)" }} />
              {km(c.doneKm)}
            </span>
          )}
          {c.gym && <Dumbbell aria-hidden className="text-muted-foreground size-3" />}
        </>
      )}
    </>
  );
  const base = `flex min-h-16 flex-col items-start gap-0.5 rounded-md p-1 ${
    c.today ? "ring-2 ring-[var(--series-planned)]" : ""
  } ${c.inMonth ? "" : "opacity-40"}`;
  return c.inPlan ? (
    <Link href={`/plan/${c.date}`} aria-label={cellLabel(c)} aria-current={c.today ? "date" : undefined} className={`${base} hover:bg-muted/50`}>
      {body}
    </Link>
  ) : (
    <div role="group" aria-label={cellLabel(c)} aria-current={c.today ? "date" : undefined} className={base}>
      {body}
    </div>
  );
}

export function CalendarGrid({ weeks }: { weeks: CalendarCell[][] }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-xs" aria-hidden>
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <ul className="grid grid-cols-7 gap-1">
        {weeks.flat().map((c) => (
          <li key={c.date}><Cell c={c} /></li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--series-planned)" }} /> Planned km
        </span>
        <span className="flex items-center gap-1">
          <Check aria-hidden className="size-3" style={{ color: "var(--series-actual)" }} /> Done km
        </span>
        <span className="flex items-center gap-1"><Dumbbell aria-hidden className="size-3" /> Gym</span>
        <span className="flex items-center gap-1"><Lock aria-hidden className="size-3" /> Locked</span>
      </p>
    </div>
  );
}
