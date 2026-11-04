"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createApproveDb } from "@/lib/watch-db";
import { approveRuns, type ApproveResult } from "@/lib/watch-approve";
import { todayLocal } from "@/lib/weeks";

/** Record Vicky's approval for one or more days. The watch job does the sending. */
export async function approveRunsAction(dates: string[]): Promise<ApproveResult[]> {
  const list = Array.isArray(dates) ? dates.map((d) => String(d)) : [];
  const db = createApproveDb(await createClient());
  const results = await approveRuns(db, list, todayLocal());
  if (results.some((r) => r.status === "approved")) revalidatePath("/", "layout");
  return results;
}
