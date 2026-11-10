"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addExercisesAction, addWorkoutAction, deleteExerciseAction, deleteWorkoutAction } from "@/app/(app)/gym/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEntries } from "@/lib/strength-entry";
import type { SaveResult, WorkoutInput } from "@/lib/strength-save";
import { setLabel } from "@/lib/strength";

const BOX =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm";

/** Type one exercise per line. Shows what was understood, and what was not, before anything is saved. */
export function EntryEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const { exercises, errors } = parseEntries(value);
  const typed = value.trim().length > 0;
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block space-y-1">
        <span className="text-muted-foreground block text-xs">One exercise per line, like: Bench press, 4 x 8 at 40 kg</span>
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={BOX}
          placeholder={"Bench press, 4 x 8 at 40 kg\nPull ups, 3 x 10\nRow: 10 at 30, 10 at 30, 8 at 35"} />
      </label>
      {typed && errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-red-400">
          {errors.map((e, i) => <li key={i}>Line {e.line}: {e.error}</li>)}
        </ul>
      )}
      {exercises.length > 0 && (
        <ul aria-label="What will be saved" className="space-y-2 text-sm">
          {exercises.map((ex, i) => (
            <li key={i}>
              <p className="font-medium">{ex.name}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {ex.sets.map((s, n) => (
                  <li key={n} aria-label={setLabel(n + 1, s.reps, s.kg).long} className="bg-muted rounded-md px-2.5 py-1 tabular-nums">{setLabel(n + 1, s.reps, s.kg).short}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function save(work: () => Promise<SaveResult>, done: () => void) {
    setError(null);
    start(async () => {
      try {
        const result = await work();
        if (result.ok) {
          done();
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("Not saved. Check your signal and try again.");
      }
    });
  }
  return { pending, error, save, setError };
}

/** "Add an exercise" on a session. Works on a watch session too: what you add is marked as yours. */
export function AddExerciseForm({ sessionId, add = addExercisesAction }: { sessionId: string; add?: (sessionId: string, text: string) => Promise<SaveResult> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { pending, error, save } = useSaver();
  const canSave = parseEntries(text).errors.length === 0 && text.trim().length > 0;

  if (!open) {
    return <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>Add an exercise</Button>;
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <EntryEditor value={text} onChange={setText} />
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className="min-h-11 flex-1" disabled={!canSave || pending}
          onClick={() => save(() => add(sessionId, text), () => { setText(""); setOpen(false); })}>
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => { setOpen(false); setText(""); }}>Cancel</Button>
      </div>
    </div>
  );
}

/** "Add a workout" on the Gym tab: a day, optional details, and the exercises. */
export function AddWorkoutForm({ today, add = addWorkoutAction }: { today: string; add?: (input: WorkoutInput) => Promise<SaveResult> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const { pending, error, save } = useSaver();
  const canSave = parseEntries(text).errors.length === 0 && text.trim().length > 0 && date.length > 0;

  function reset() { setOpen(false); setName(""); setMinutes(""); setNote(""); setText(""); setDate(today); }

  if (!open) {
    return <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>Add a workout</Button>;
  }
  return (
    <section aria-label="Add a workout" className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 ring-1">
      <h2 className="font-semibold">Add a workout</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1"><span className="text-muted-foreground block text-xs">Day</span>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></label>
        <label className="space-y-1"><span className="text-muted-foreground block text-xs">Minutes (optional)</span>
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="55" /></label>
      </div>
      <label className="block space-y-1"><span className="text-muted-foreground block text-xs">Name (optional)</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push day" maxLength={120} /></label>
      <EntryEditor value={text} onChange={setText} />
      <label className="block space-y-1"><span className="text-muted-foreground block text-xs">Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={BOX} maxLength={5000} /></label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className="min-h-11 flex-1" disabled={!canSave || pending}
          onClick={() => save(() => add({ date, name, minutes, note, text }), reset)}>
          {pending ? "Saving..." : "Save workout"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={reset}>Cancel</Button>
      </div>
    </section>
  );
}

/** Two taps on purpose. Nothing is removed until the second one. */
export function DeleteButton({ label, confirmLabel, run }: { label: string; confirmLabel: string; run: () => Promise<SaveResult> }) {
  const [asking, setAsking] = useState(false);
  const { pending, error, save } = useSaver();
  if (!asking) {
    return <Button type="button" variant="ghost" size="sm" className="text-muted-foreground min-h-11" onClick={() => setAsking(true)}>{label}</Button>;
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={pending} onClick={() => save(run, () => setAsking(false))}>
          {pending ? "Removing..." : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={pending} onClick={() => setAsking(false)}>Keep it</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** Remove one exercise you added. Only exercises marked as yours get this button. */
export function RemoveExerciseButton({ sessionId, positions, remove = deleteExerciseAction }: { sessionId: string; positions: number[]; remove?: (sessionId: string, positions: number[]) => Promise<SaveResult> }) {
  return <DeleteButton label="Remove" confirmLabel="Yes, remove it" run={() => remove(sessionId, positions)} />;
}

/** Remove a whole workout you added. Only workouts marked as yours get this button. */
export function RemoveWorkoutButton({ sessionId, remove = deleteWorkoutAction }: { sessionId: string; remove?: (sessionId: string) => Promise<SaveResult> }) {
  return <DeleteButton label="Remove this workout" confirmLabel="Yes, remove the workout" run={() => remove(sessionId)} />;
}
