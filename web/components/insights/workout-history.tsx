import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { insightsHref, TABLE_SORTS, LOAD_KINDS, type InsightsRange } from "@/lib/insights-range";
import { dayMonth, weekdayShort } from "@/lib/weeks";
import { ROWS_SHOWN, type WorkoutRow } from "@/lib/workout-table";

const NO_DATA = <span className="text-muted-foreground">no data</span>;
const cell = (v: string | number | null) => (v === null ? NO_DATA : v);
const segment = (active: boolean) =>
  `flex min-h-11 items-center justify-center rounded-md px-3 text-sm ${active ? "bg-background font-medium" : "text-muted-foreground"}`;

function Controls({ range, shown, total }: { range: InsightsRange; shown: number; total: number }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Workout type" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
          {LOAD_KINDS.map((k) => (
            <Link key={k.value} href={insightsHref(range, { workouts: k.value, allRows: false })} aria-current={range.workouts === k.value ? "true" : undefined} className={segment(range.workouts === k.value)}>{k.label}</Link>
          ))}
        </nav>
        <nav aria-label="Sort workouts" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {TABLE_SORTS.map((o) => (
            <Link key={o.value} href={insightsHref(range, { sort: o.value })} aria-current={range.sort === o.value ? "true" : undefined} className={segment(range.sort === o.value)}>{o.label}</Link>
          ))}
        </nav>
      </div>
      <p className="text-muted-foreground text-xs">
        Showing {shown} of {total} {total === 1 ? "workout" : "workouts"}.{" "}
        {!range.allRows && total > ROWS_SHOWN && <Link href={insightsHref(range, { allRows: true })} className="text-foreground underline">Show all {total}</Link>}
        {range.allRows && total > ROWS_SHOWN && <Link href={insightsHref(range, { allRows: false })} className="text-foreground underline">Show only the newest {ROWS_SHOWN}</Link>}
      </p>
    </div>
  );
}

function Title({ row }: { row: WorkoutRow }) {
  return (
    <>
      {row.title} {row.manual && <Badge variant="secondary" className="ml-1">Added by you</Badge>}
    </>
  );
}

/** Every run and gym session in the range: a table on a laptop, small cards on a phone. Tapping one opens it. */
export function WorkoutHistory({ rows, range, total }: { rows: WorkoutRow[]; range: InsightsRange; total: number }) {
  return (
    <div className="space-y-4">
      <Controls range={range} shown={rows.length} total={total} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">No workouts in this range.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  {["Date", "Workout", "Distance or sets", "Time", "Pace", "Heart rate", "Load", "How it felt", "Note"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/40 border-t align-top">
                    <td className="text-muted-foreground py-2 pr-4 whitespace-nowrap">{weekdayShort(r.date)} {dayMonth(r.date)}</td>
                    <td className="py-2 pr-4 font-medium"><Link href={r.href} className="underline-offset-2 hover:underline"><Title row={r} /></Link></td>
                    <td className="py-2 pr-4 whitespace-nowrap">{cell(r.size)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{cell(r.time)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.kind === "run" ? cell(r.pace) : <span className="text-muted-foreground">·</span>}</td>
                    <td className="py-2 pr-4">{cell(r.hr)}</td>
                    <td className="py-2 pr-4">{cell(r.load)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{cell(r.effort)}</td>
                    <td className="max-w-xs py-2 pr-4">{r.note ? <span title={r.noteIsShortened ? "Open the workout to read all of it" : undefined}>{r.note}</span> : NO_DATA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="bg-card ring-foreground/10 hover:bg-muted/40 block space-y-1 rounded-xl p-3 text-sm ring-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium"><Title row={r} /></span>
                    <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
                  </div>
                  <p className="text-muted-foreground text-xs">{weekdayShort(r.date)} {dayMonth(r.date)}</p>
                  <p className="tabular-nums">{[r.size, r.time, r.pace].filter(Boolean).join(" · ") || NO_DATA}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {[r.hr !== null ? `${r.hr} bpm` : null, r.load !== null ? `load ${r.load}` : null, r.effort].filter(Boolean).join(" · ") || "no heart rate, load or effort"}
                  </p>
                  {r.note && <p className="text-xs">{r.note}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
