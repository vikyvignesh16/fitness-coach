import Link from "next/link";
import { CostChart } from "@/components/costs/cost-chart";
import { ChartCard } from "@/components/insights/chart-card";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBanner } from "@/components/status-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { spendLine } from "@/lib/chat";
import {
  VIEWS, averageChatCall, breakdown, bucketCosts, chartTable, failures, formatUsd, monthForecast, parseCostView, thisMonth, totals,
  type Breakdown,
} from "@/lib/costs";
import { loadCosts } from "@/lib/data";
import { todayLocal } from "@/lib/weeks";

const segment = (active: boolean) =>
  `flex min-h-11 items-center justify-center rounded-md px-3 text-sm ${active ? "bg-background font-medium" : "text-muted-foreground"}`;

const tokens = (n: number) => n.toLocaleString("en-GB");

function BreakdownTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing spent yet this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr><th className="py-1 pr-3 font-medium">Name</th><th className="py-1 pr-3 font-medium">Calls</th><th className="py-1 pr-3 font-medium">Tokens in</th><th className="py-1 pr-3 font-medium">Tokens out</th><th className="py-1 font-medium">Cost</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t">
                    <td className="py-1 pr-3 break-all">{r.name}</td><td className="py-1 pr-3">{r.calls}</td>
                    <td className="py-1 pr-3">{tokens(r.inputTokens)}</td><td className="py-1 pr-3">{tokens(r.outputTokens)}</td><td className="py-1">{formatUsd(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function CostsPage(props: PageProps<"/costs">) {
  const today = todayLocal();
  const view = parseCostView((await props.searchParams).view);
  const { rows, capUsd, truncated } = await loadCosts(today);

  const sums = totals(rows, today);
  const line = spendLine({ spentUsd: sums.month, capUsd });
  const forecast = monthForecast(sums.month, today);
  const buckets = bucketCosts(rows, view, today);
  const month = thisMonth(rows, today);
  const avg = averageChatCall(month);
  const problems = failures(month);
  const span = VIEWS.find((v) => v.value === view)!.span;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Costs</h1>
        <p className="text-muted-foreground text-sm">What the coach and the library have cost in model calls. Only the receipts are read: the model, token counts and cost. Never a message.</p>
      </div>

      {line.level === "stop" && <StatusBanner level="stop" title="The monthly spending cap is reached">The coach will not answer until next month, or until the cap is raised.</StatusBanner>}
      {line.level === "careful" && <StatusBanner level="careful" title="Close to the monthly spending cap">{line.text}.</StatusBanner>}
      {truncated && <StatusBanner level="info" title="Some older receipts are not shown">There are more than {tokens(10_000)} receipts in the last six months, so the oldest ones are left out.</StatusBanner>}

      <section aria-label="Spending so far" className="grid grid-cols-3 gap-3">
        {([["Today", sums.today], ["This week", sums.week], ["This month", sums.month]] as const).map(([label, value]) => (
          <Card key={label} size="sm" data-total={label}>
            <CardContent className="space-y-1">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-xl font-bold tabular-nums sm:text-2xl">{formatUsd(value)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-2">
          <ProgressBar value={sums.month} max={capUsd} label="Spent this month against the monthly cap" />
          <p className="text-sm">{line.text}</p>
          <p className="text-muted-foreground text-xs">
            If spending carries on at the pace so far, the month could end between {formatUsd(forecast.low)} and {formatUsd(forecast.high)}.
            The low end is nothing more spent. The high end is today&apos;s pace for the rest of the month. One heavy day of use early in the month can make the high end look bigger than it will be.
          </p>
        </CardContent>
      </Card>

      <ChartCard
        title="Spending over time"
        purpose={`Money spent in model calls, ${span}, split by what it was spent on.`}
        hasData={buckets.some((b) => b.total > 0 || b.calls > 0)}
        table={chartTable(buckets, view)}
        controls={
          <nav aria-label="Day, week or month" className="bg-muted grid max-w-sm grid-cols-3 gap-1 rounded-lg p-1">
            {VIEWS.map((v) => (
              <Link key={v.value} href={`/costs?view=${v.value}`} aria-current={view === v.value ? "true" : undefined} className={segment(view === v.value)}>{v.label}</Link>
            ))}
          </nav>
        }
      >
        <CostChart data={buckets} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="This month by model" rows={breakdown(month, "model")} />
        <BreakdownTable title="This month by purpose" rows={breakdown(month, "purpose")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calls and refusals this month</CardTitle>
          <CardDescription>{month.length} {month.length === 1 ? "call" : "calls"}{avg !== null ? `. An average successful chat call cost ${formatUsd(avg)}. One chat message can make several calls.` : "."}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {problems.length === 0 ? (
            <p className="text-muted-foreground">Every call went through.</p>
          ) : (
            <ul className="space-y-1">
              {problems.map((p) => <li key={p.code}>{p.count} {p.count === 1 ? "time" : "times"}: {p.text}.</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What this page does not count</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>Railway and Supabase bills are not here. Neither is the small fee OpenRouter adds when you top up your balance (about 5.5 percent).</p>
          <p>The costs here are worked out by the app from token counts and the price list in the code, not read back from OpenRouter. Once a month, compare the total with the OpenRouter dashboard. A gap means a price changed.</p>
        </CardContent>
      </Card>
    </>
  );
}
