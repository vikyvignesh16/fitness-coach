"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { forgetFactAction } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { MAX_FACTS, type RememberedFact } from "@/lib/chat";

type Deps = { forget: typeof forgetFactAction };
const defaultDeps: Deps = { forget: forgetFactAction };

/** What the coach remembers. Facts are added by the coach when you ask it to remember something. Here you can only remove them. */
export function MemoryPanel({ facts, deps = defaultDeps }: { facts: RememberedFact[]; deps?: Deps }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function forget(id: string) {
    setBusy(id);
    setError(null);
    try {
      const result = await deps.forget(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch {
      setError("Could not forget that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{facts.length} of {MAX_FACTS} notes. The coach reads all of them before every answer.</p>
      {facts.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing remembered yet. Say &quot;remember that...&quot; in a chat.</p>
      ) : (
        <ul className="space-y-2">
          {facts.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 text-sm">
              <span>{f.fact}</span>
              <Button variant="outline" size="sm" disabled={busy === f.id} onClick={() => forget(f.id)} aria-label={`Forget: ${f.fact}`}>
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
