import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GymDb } from "@/lib/gym-save";
import { isWeekLocked } from "@/lib/lock-db";

/** The real database behind GymDb. Uses the signed in user's session, so row level security applies too. */
export function createGymDb(supabase: SupabaseClient): GymDb {
  return {
    async getPlannedDay(date) {
      const { data: version } = await supabase
        .from("plan_versions").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!version) return null;
      const { data, error } = await supabase
        .from("plan_days").select("week, gym").eq("plan_version_id", version.id).eq("date", date).maybeSingle();
      if (error) throw error;
      if (!data?.gym?.session) return null;
      return { week: data.week, session: data.gym.session, exercises: data.gym.key_exercises ?? [] };
    },

    isWeekLocked: (week) => isWeekLocked(supabase, week),

    async upsertSession(date, name) {
      const { data, error } = await supabase
        .from("gym_sessions").upsert({ date, name }, { onConflict: "user_id,date" }).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },

    async upsertSet(row) {
      const { error } = await supabase.from("gym_sets").upsert(row, { onConflict: "session_id,exercise,set_no" });
      if (error) throw error;
    },

    async setFinished(date) {
      const { error } = await supabase
        .from("gym_sessions").update({ finished_at: new Date().toISOString() }).eq("date", date);
      if (error) throw error;
    },
  };
}
