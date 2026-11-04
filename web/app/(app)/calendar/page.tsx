import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CalendarGrid, cellLabel } from "@/components/calendar-grid";
import { buildMonth, monthLabel, parseMonth, shiftMonth } from "@/lib/calendar";
import { loadDashboardData } from "@/lib/data";
import { lockedWeeks } from "@/lib/gates";
import { todayLocal } from "@/lib/weeks";

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const today = todayLocal();
  const month = parseMonth((await props.searchParams).month, today);
  const { days, runs, ankleGatePassed } = await loadDashboardData();
  const weeks = buildMonth(month, days, runs, today, lockedWeeks(ankleGatePassed));
  const withRuns = weeks.flat().filter((c) => c.inMonth && c.inPlan && (c.plannedKm != null || c.doneKm != null));
  const nav = "text-muted-foreground flex size-11 items-center justify-center rounded-md";

  return (
    <>
      <div className="flex items-center gap-1">
        <h1 className="flex-1 text-xl font-semibold">{monthLabel(month)}</h1>
        {month !== today.slice(0, 7) && (
          <Link href="/calendar" className="text-muted-foreground flex min-h-11 items-center px-2 text-sm">Today</Link>
        )}
        <Link href={`/calendar?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className={nav}>
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <Link href={`/calendar?month=${shiftMonth(month, 1)}`} aria-label="Next month" className={nav}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </div>

      <CalendarGrid weeks={weeks} />

      <section aria-label="Runs this month">
        <h2 className="mb-2 text-sm font-medium">Runs this month</h2>
        {withRuns.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing planned or recorded this month.</p>
        ) : (
          <ul className="text-sm">
            {withRuns.map((c) => (
              <li key={c.date} className="border-b last:border-b-0">
                <Link href={`/plan/${c.date}`} className="block py-3">{cellLabel(c)}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
