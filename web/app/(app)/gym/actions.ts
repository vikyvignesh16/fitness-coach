"use server";

import { revalidatePath } from "next/cache";
import { supabaseStrengthDb } from "@/lib/strength-db";
import { addExercises, addWorkout, deleteExercise, deleteWorkout, type SaveResult, type WorkoutInput } from "@/lib/strength-save";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/weeks";

// These run as the signed in user, so the database's own rules apply: only manual rows can be added or removed.

async function run(work: (db: ReturnType<typeof supabaseStrengthDb>) => Promise<SaveResult>): Promise<SaveResult> {
  const result = await work(supabaseStrengthDb(await createClient()));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function addWorkoutAction(input: WorkoutInput): Promise<SaveResult> {
  return run((db) => addWorkout(db, {
    date: String(input?.date ?? ""), name: String(input?.name ?? ""), minutes: String(input?.minutes ?? ""),
    note: String(input?.note ?? ""), text: String(input?.text ?? ""),
  }, todayLocal()));
}

export async function addExercisesAction(sessionId: string, text: string): Promise<SaveResult> {
  return run((db) => addExercises(db, { sessionId: String(sessionId), text: String(text) }));
}

export async function deleteExerciseAction(sessionId: string, positions: number[]): Promise<SaveResult> {
  return run((db) => deleteExercise(db, String(sessionId), Array.isArray(positions) ? positions.map(Number) : []));
}

export async function deleteWorkoutAction(sessionId: string): Promise<SaveResult> {
  return run((db) => deleteWorkout(db, String(sessionId)));
}
