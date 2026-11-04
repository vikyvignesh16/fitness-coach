"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adoptProposalAction } from "@/app/(app)/plan/proposal/actions";
import { Button } from "@/components/ui/button";
import type { AdoptResult } from "@/lib/proposal-adopt";

type Adopt = (id: string) => Promise<AdoptResult>;

/** Two taps on purpose: switching the whole plan is a big step. Nothing changes until the second tap. */
export function AdoptPlanButton({ id, version, adopt = adoptProposalAction }: { id: string; version: string; adopt?: Adopt }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    start(async () => {
      try {
        const result = await adopt(id);
        if (!result.ok) {
          setError(result.error);
          setAsking(false);
        }
        router.refresh();
      } catch {
        setError("Not saved. Check your signal and try again.");
        setAsking(false);
      }
    });
  }

  if (!asking) {
    return (
      <div className="space-y-2">
        <Button type="button" className="w-full" onClick={() => setAsking(true)}>
          Approve v{version}
        </Button>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm">
        This switches your whole plan to v{version}. Your old plan is kept and never changed. Switch now?
      </p>
      <div className="flex gap-2">
        <Button type="button" className="flex-1" disabled={pending} onClick={confirm}>
          {pending ? "Switching..." : `Yes, switch to v${version}`}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setAsking(false)}>
          Not yet
        </Button>
      </div>
    </div>
  );
}
