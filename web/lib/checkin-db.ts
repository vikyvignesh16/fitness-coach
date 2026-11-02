import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckinDb } from "@/lib/checkin-save";

export function createCheckinDb(supabase: SupabaseClient): CheckinDb {
  return {
    async currentUserId() {
      const { data } = await supabase.auth.getUser(); // asks Supabase to check the login, not just read the cookie
      return data.user?.id ?? null;
    },
    async upsertCheckin(row) {
      const { error } = await supabase.from("checkins").upsert(row, { onConflict: "user_id,week_start" });
      if (error) throw error;
    },
  };
}
