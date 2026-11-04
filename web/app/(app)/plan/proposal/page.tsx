import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AdoptPlanButton } from "@/components/adopt-plan-button";
import { StatusBanner } from "@/components/status-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboardData, loadProposal } from "@/lib/data";
import { dayMonth, weekdayShort } from "@/lib/weeks";

const days = (list: string[]) => list.map((d) => `${weekdayShort(d)} ${dayMonth(d)}`).join(", ");

export default async function ProposalPage() {
  const p = await loadProposal();

  if (!p) {
    return (
      <>
        <Link href="/plan" className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
          <ArrowLeft aria-hidden className="size-4" /> Plan
        </Link>
        <h1 className="text-xl font-semibold">New plan</h1>
        <p className="text-muted-foreground text-sm">No new plan is waiting. Your plan is v{(await loadDashboardData()).version}.</p>
      </>
    );
  }

  const byWeek = new Map<number, typeof p.changes>();
  for (const c of p.changes) byWeek.set(c.week, [...(byWeek.get(c.week) ?? []), c]);
  const blocked = p.errors.length > 0;

  return (
    <>
      <Link href="/plan" className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Plan
      </Link>
      <div>
        <h1 className="text-xl font-semibold">New plan v{p.version}</h1>
        <p className="text-muted-foreground text-sm">
          Checked on {dayMonth(p.createdOn)}. You are on v{p.currentVersion}. Nothing changes until you approve.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Why it changed</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>{p.reason}</p>
          <p className="text-muted-foreground mt-2">This is the reason ChatGPT gave. It has not been checked against the evidence library.</p>
        </CardContent>
      </Card>

      {blocked ? (
        <StatusBanner level="stop" title="This plan has problems and cannot be approved">
          <ul className="list-disc pl-4">{p.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </StatusBanner>
      ) : (
        <StatusBanner level="good" title="Safety checks passed">
          {p.warnings.length === 0 ? "No warnings." : `${p.warnings.length} ${p.warnings.length === 1 ? "warning" : "warnings"} for you to look at.`}
        </StatusBanner>
      )}

      {p.warnings.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Warnings</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-2">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {(p.impact.alreadySent.length > 0 || p.impact.cancelled.length > 0) && (
        <StatusBanner level="careful" title="Some watch workouts are affected">
          {p.impact.alreadySent.length > 0 && (
            <p>
              Already on your COROS calendar and now different: {days(p.impact.alreadySent)}. COROS has no delete, so remove
              {p.impact.alreadySent.length === 1 ? " it" : " them"} in the COROS app, then approve the new workout.
            </p>
          )}
          {p.impact.cancelled.length > 0 && (
            <p>
              Approved but not sent yet, and now different: {days(p.impact.cancelled)}. These approvals are cancelled. Approve them
              again on the Approve runs page.
            </p>
          )}
        </StatusBanner>
      )}

      <Card>
        <CardHeader><CardTitle>What changes</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {p.changes.length} {p.changes.length === 1 ? "day differs" : "days differ"} from v{p.currentVersion}.
            {p.notesAdded > 0 && <> Coaching notes are added to {p.notesAdded} days (shown in the app only).</>}
          </p>
          {[...byWeek.entries()].map(([week, list]) => (
            <details key={week} className="rounded-lg border px-3">
              <summary className="cursor-pointer py-2 font-medium">Week {week} · {list.length} {list.length === 1 ? "day" : "days"}</summary>
              <ul className="space-y-2 pb-3">
                {list.map((c) => (
                  <li key={c.date}>
                    <span className="font-medium">{weekdayShort(c.date)} {dayMonth(c.date)}</span>
                    <span className="text-muted-foreground"> · {c.reasons.join("; ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </CardContent>
      </Card>

      {!blocked && <AdoptPlanButton id={p.id} version={p.version} />}
    </>
  );
}

