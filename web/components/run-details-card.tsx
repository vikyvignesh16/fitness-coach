import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { detailRows, noteOf } from "@/lib/run-details";
import type { RunExtra } from "@/lib/types";

/** What COROS knows about this run, and the note you typed in the COROS app. */
export function RunDetailsCard({ extra }: { extra: RunExtra | null }) {
  const rows = extra ? detailRows(extra) : [];
  const note = extra ? noteOf(extra) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>From your watch</CardTitle>
        <CardDescription>
          {rows.length || note
            ? "Details COROS adds after the run. If you change the note or how it felt in the COROS app, it shows here within a few hours."
            : "COROS adds these a little after the run. Nothing has arrived for this run yet."}
        </CardDescription>
      </CardHeader>
      {(rows.length > 0 || note) && (
        <CardContent className="space-y-3 text-sm">
          {rows.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd>{r.value}</dd>
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
        </CardContent>
      )}
    </Card>
  );
}
