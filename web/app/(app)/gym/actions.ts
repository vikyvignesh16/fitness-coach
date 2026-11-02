"use server";

import { revalidatePath } from "next/cache";
import { createGymDb } from "@/lib/gym-db";
import { finishWorkout, saveSet, type SaveResult, type SaveSetInput } from "@/lib/gym-save";
import { createClient } from "@/lib/supabase/server";

/** Save one set. All the checking happens in saveSet, on the server. */
export async function saveSetAction(input: SaveSetInput): Promise<SaveResult> {
  const db = createGymDb(await createClient());
  return saveSet(db, {
    date: String(input?.date ?? ""),
    exercise: String(input?.exercise ?? ""),
    setNo: Number(input?.setNo),
    reps: String(input?.reps ?? ""),
    loadKg: String(input?.loadKg ?? ""),
    seconds: String(input?.seconds ?? ""),
    done: input?.done === true,
  });
}

export async function finishWorkoutAction(date: string): Promise<SaveResult> {
  const db = createGymDb(await createClient());
  const result = await finishWorkout(db, String(date ?? ""));
  if (result.ok) revalidatePath("/gym", "layout");
  return result;
}
