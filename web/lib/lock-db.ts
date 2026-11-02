import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANKLE_GATE_ID } from "@/lib/gate-record";
import { lockedWeeks } from "@/lib/gates";
import { gatePassed } from "@/lib/weeks";

/** True when that week is still locked, meaning the ankle check has not been passed. One copy, used by gym and approvals. */
export async function isWeekLocked(supabase: SupabaseClient, week: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("approvals").select("passed, created_at").eq("kind", "gate").eq("gate_id", ANKLE_GATE_ID);
  if (error) throw error;
  return lockedWeeks(gatePassed(data ?? [])).includes(week);
}
