"use server";

import { revalidatePath } from "next/cache";
import { createCheckinDb } from "@/lib/checkin-db";
import { saveCheckin, type CheckinInput, type CheckinResult } from "@/lib/checkin-save";
import { createClient } from "@/lib/supabase/server";
import { mondayOf, todayLocal } from "@/lib/weeks";

/** Save this week's check in. All the checking, including the pain stop, happens in saveCheckin. */
export async function saveCheckinAction(input: CheckinInput): Promise<CheckinResult> {
  const db = createCheckinDb(await createClient());
  const result = await saveCheckin(db, mondayOf(todayLocal()), {
    weightKg: String(input?.weightKg ?? ""),
    heightCm: String(input?.heightCm ?? ""),
    feeling: String(input?.feeling ?? ""),
    painScore: String(input?.painScore ?? "0"),
    painRepeated: input?.painRepeated === true,
    painLastedHours: String(input?.painLastedHours ?? "0"),
    painWorseNextMorning: input?.painWorseNextMorning === true,
    flags: Array.isArray(input?.flags) ? input.flags.map(String) : [],
    photos: {
      front: input?.photos?.front === true,
      side: input?.photos?.side === true,
      back: input?.photos?.back === true,
    },
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
