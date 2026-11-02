"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveRunsAction } from "@/app/(app)/approve/actions";
import { Button } from "@/components/ui/button";
import type { ApproveResult } from "@/lib/watch-approve";

type Approve = (dates: string[]) => Promise<ApproveResult[]>;

function messageFor(results: ApproveResult[]): string | null {
  const refused = results.filter((r) => r.status === "refused");
  return refused.length ? refused.map((r) => r.status === "refused" && r.error).join(" ") : null;
}

/** One button that approves one or more days. Nothing reaches the watch until it is pressed. */
export function ApproveButton({
  dates,
  label,
  variant = "default",
  approve = approveRunsAction,
}: {
  dates: string[];
  label: string;
  variant?: "default" | "outline";
  approve?: Approve;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      try {
        const message = messageFor(await approve(dates));
        if (message) setError(message);
        router.refresh();
      } catch {
        setError("Not saved. Check your signal and try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} className="w-full" disabled={pending || dates.length === 0} onClick={onClick}>
        {pending ? "Saving..." : label}
      </Button>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
