import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWeekLocked } from "@/lib/lock-db";
import type { ApproveDb } from "@/lib/watch-approve";

/** The real database behind ApproveDb. Uses the signed in user's session, so row level security applies too. */
export function createApproveDb(supabase: SupabaseClient): ApproveDb {
  async function versionId(): Promise<string | null> {
    const { data } = await supabase
      .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data?.id ?? null;
  }

  return {
    planVersionId: versionId,

    async getPlannedRun(date) {
      const id = await versionId();
      if (!id) return null;
      const { data, error } = await supabase
        .from("plan_days").select("week, run").eq("plan_version_id", id).eq("date", date).maybeSingle();
      if (error) throw error;
      if (!data?.run) return null;
      return { week: data.week, type: data.run.type, distanceKm: Number(data.run.distance_km ?? 0) };
    },

    isWeekLocked: (week) => isWeekLocked(supabase, week),

    async isPainStopped() {
      const { data, error } = await supabase
        .from("checkins").select("pain_stop").order("week_start", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data?.pain_stop === true; // the newest check in decides. A later check in without a stop clears it.
    },

    async insertApproval(row) {
      const { error } = await supabase.from("approvals").insert({ kind: "watch_workout", ...row });
      if (!error) return "created";
      if (error.code === "23505") return "exists"; // the one per day rule
      throw error;
    },
  };
}
