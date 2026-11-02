"use client";

import { useActionState } from "react";
import type { GateState } from "@/app/(app)/gates/ankle/actions";
import { submitAnkleGate } from "@/app/(app)/gates/ankle/actions";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/status-banner";
import { ANKLE_CHECKS } from "@/lib/gates";

const initial: GateState = { error: null, passed: null, message: null };

export function AnkleGateForm({ action = submitAnkleGate }: { action?: typeof submitAnkleGate }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-5">
      {ANKLE_CHECKS.map((c) => (
        <fieldset key={c.id} className="space-y-2">
          <legend className="text-sm font-medium">{c.label}</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name={c.id} value="yes" required /> Yes, passed
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name={c.id} value="no" required /> No
            </label>
          </div>
        </fieldset>
      ))}
      {state.error && <p role="alert" className="text-destructive text-sm">{state.error}</p>}
      {state.message && (
        <StatusBanner level={state.passed ? "good" : "stop"} title={state.passed ? "Passed" : "Not passed"}>
          {state.message}
        </StatusBanner>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save my answers"}</Button>
    </form>
  );
}
