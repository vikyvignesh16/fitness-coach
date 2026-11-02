import { AnkleGateForm } from "@/components/ankle-gate-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ANKLE_GATE_ID } from "@/lib/gate-record";
import { createClient } from "@/lib/supabase/server";
import { dayMonth } from "@/lib/weeks";

export default async function AnkleGatePage() {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("approvals")
    .select("passed, checks, created_at")
    .eq("kind", "gate")
    .eq("gate_id", ANKLE_GATE_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Ankle check</h1>
        <p className="text-muted-foreground text-sm">
          Gate ankle_return_w2. Week 2 stays locked until all four checks are passed. This is not medical advice.
        </p>
      </div>

      {latest && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Last answered {dayMonth(latest.checks?.date ?? latest.created_at.slice(0, 10))}:{" "}
          <strong>{latest.passed ? "passed" : "not passed"}</strong>.
          {latest.passed ? " Week 2 is unlocked." : " Week 2 is still locked."}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s checks</CardTitle>
          <CardDescription>Answer each one honestly. A new answer replaces the old result.</CardDescription>
        </CardHeader>
        <CardContent>
          <AnkleGateForm />
        </CardContent>
      </Card>
    </>
  );
}
