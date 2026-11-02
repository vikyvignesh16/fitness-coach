"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { saveSetAction } from "@/app/(app)/gym/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLoad, parsePlannedReps, planLine, type PlannedExercise, type SetRow } from "@/lib/gym";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function ExerciseCard({
  date,
  exercise,
  initialRows,
  last,
  disabled,
  defaultOpen,
  save = saveSetAction,
}: {
  date: string;
  exercise: PlannedExercise;
  initialRows: SetRow[];
  last: { loadKg: number; reps: number | null; date: string } | null;
  disabled: boolean;
  defaultOpen: boolean;
  save?: typeof saveSetAction;
}) {
  const [rows, setRows] = useState(initialRows);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timed = parsePlannedReps(exercise.reps).kind === "timed";
  const planned = exercise.sets ?? 1;
  const doneCount = rows.slice(0, planned).filter((r) => r.done).length;
  const allDone = doneCount === planned;

  function edit(index: number, patch: Partial<SetRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: SetRow) {
    setStatus({ kind: "saving" });
    try {
      const result = await save({
        date,
        exercise: exercise.name,
        setNo: row.setNo,
        reps: row.reps,
        loadKg: row.loadKg,
        seconds: row.seconds,
        done: row.done,
      });
      setStatus(result.ok ? { kind: "saved" } : { kind: "error", message: result.error });
    } catch {
      // No signal, for example. What was typed stays in the boxes.
      setStatus({ kind: "error", message: "Not saved. Check your signal and tap the tick again." });
    }
  }

  function toggleDone(index: number) {
    const next = { ...rows[index], done: !rows[index].done };
    edit(index, { done: next.done });
    void saveRow(next);
  }

  function addSet() {
    setRows((rs) => [...rs, { setNo: rs.length + 1, reps: "", loadKg: "", seconds: "", done: false }]);
  }

  return (
    <details open={defaultOpen} className="bg-card rounded-xl border">
      <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 font-medium">{exercise.name}</span>
        {allDone ? (
          <Badge>Done</Badge>
        ) : (
          <span className="text-muted-foreground text-sm tabular-nums">{doneCount}/{planned}</span>
        )}
      </summary>

      <div className="space-y-3 px-4 pb-4">
        <div className="text-muted-foreground space-y-0.5 text-sm">
          <p>{planLine(exercise)}</p>
          {last && <p>Last time: {formatLoad(last.loadKg)}{last.reps != null && <> x {last.reps}</>}</p>}
        </div>

        <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 text-xs text-muted-foreground" aria-hidden>
          <span>Set</span>
          {timed ? <><span className="col-span-2">Seconds</span></> : <><span>Reps</span><span>Kg</span></>}
          <span className="text-center">Done</span>
        </div>

        {rows.map((row, i) => (
          <div key={row.setNo} className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2">
            <span className="text-muted-foreground text-sm tabular-nums">{row.setNo}</span>
            {timed ? (
              <Input
                className="col-span-2"
                inputMode="numeric"
                aria-label={`Set ${row.setNo} seconds`}
                value={row.seconds}
                disabled={disabled}
                onChange={(e) => edit(i, { seconds: e.target.value })}
                onBlur={() => row.seconds !== initialRows[i]?.seconds && saveRow(rows[i])}
              />
            ) : (
              <>
                <Input
                  inputMode="numeric"
                  aria-label={`Set ${row.setNo} reps`}
                  value={row.reps}
                  disabled={disabled}
                  onChange={(e) => edit(i, { reps: e.target.value })}
                  onBlur={() => row.done && saveRow(rows[i])}
                />
                <Input
                  inputMode="decimal"
                  aria-label={`Set ${row.setNo} weight in kilograms`}
                  value={row.loadKg}
                  disabled={disabled}
                  onChange={(e) => edit(i, { loadKg: e.target.value })}
                  onBlur={() => row.done && saveRow(rows[i])}
                />
              </>
            )}
            <button
              type="button"
              aria-pressed={row.done}
              aria-label={`Set ${row.setNo} done`}
              disabled={disabled}
              onClick={() => toggleDone(i)}
              className={`flex size-11 items-center justify-center justify-self-center rounded-lg border disabled:opacity-50 ${
                row.done ? "border-transparent text-white" : "text-transparent"
              }`}
              style={row.done ? { background: "var(--series-actual)" } : undefined}
            >
              <Check aria-hidden className="size-5" />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={addSet} disabled={disabled || rows.length >= 20}>
            <Plus aria-hidden className="size-4" /> Add set
          </Button>
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={`text-sm ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {status.kind === "saving" && "Saving..."}
            {status.kind === "saved" && "Saved"}
            {status.kind === "error" && status.message}
          </p>
        </div>
      </div>
    </details>
  );
}
