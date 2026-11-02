"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishWorkoutAction } from "@/app/(app)/gym/actions";
import { Button } from "@/components/ui/button";

export function FinishWorkoutButton({
  date,
  disabled,
  finish = finishWorkoutAction,
}: {
  date: string;
  disabled: boolean;
  finish?: typeof finishWorkoutAction;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await finish(date);
      if (result.ok) router.refresh();
      else setError(result.error);
    } catch {
      setError("Not saved. Check your signal and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" disabled={disabled || pending} onClick={onClick}>
        {pending ? "Saving..." : "Finish workout"}
      </Button>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
