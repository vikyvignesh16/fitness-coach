import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Flag } from "@/lib/insights-flags";

/** Facts about your own numbers, checked against limits Vicky approved. It states what the watch shows and gives no advice. */
export function NeedsWorkCard({ flags }: { flags: Flag[] }) {
  const flagged = flags.filter((f) => f.state === "flag");
  const ok = flags.filter((f) => f.state === "ok");
  const unchecked = flags.filter((f) => f.state === "nodata");
  return (
    <Card>
      <CardHeader>
        <CardTitle>What needs a look</CardTitle>
        <CardDescription>Six checks on your recent numbers. It states facts from your watch and gives no advice yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {flagged.length === 0 && <p>Nothing stands out. None of the checks that could run crossed its limit.</p>}
        {flagged.length > 0 && (
          <ul className="space-y-2">
            {flagged.map((f) => (
              <li key={f.id} className="rounded-md border px-3 py-2">
                <span className="font-medium">{f.title}. </span>{f.fact}
              </li>
            ))}
          </ul>
        )}
        {ok.length > 0 && <p className="text-muted-foreground text-xs">Looks fine: {ok.map((f) => f.title.toLowerCase()).join(", ")}.</p>}
        {unchecked.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground min-h-11 cursor-pointer py-2">{unchecked.length} {unchecked.length === 1 ? "check" : "checks"} not run, not enough data</summary>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {unchecked.map((f) => <li key={f.id}><span className="font-medium">{f.title}. </span>{f.fact}</li>)}
            </ul>
          </details>
        )}
        <p className="text-muted-foreground text-xs">A flag is a prompt to look at the charts, not a diagnosis. This is not medical advice. Persistent pain means stop and see a professional.</p>
      </CardContent>
    </Card>
  );
}
