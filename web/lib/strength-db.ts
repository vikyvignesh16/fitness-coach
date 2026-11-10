import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewSet, StrengthDb } from "./strength-save";

/**
 * The real database behind the manual workout checks. It runs as the signed in user, so Row Level Security applies:
 * the database only lets them add, change or remove rows marked 'manual', and only their own.
 * A delete that removes nothing (for example a watch row) counts as a failure, so it is never reported as done.
 */
export function supabaseStrengthDb(supabase: SupabaseClient): StrengthDb {
  return {
    async insertSession(row) {
      const { data, error } = await supabase.from("strength_sessions").insert({ ...row, source: "manual" }).select("id").single();
      if (error || !data) throw new Error("insert session failed");
      return data.id as string;
    },

    async maxManualPosition(sessionId) {
      const { data, error } = await supabase
        .from("strength_sets").select("position").eq("session_id", sessionId).eq("source", "manual").order("position", { ascending: false }).limit(1);
      if (error) throw new Error("read positions failed");
      return (data?.[0]?.position as number | undefined) ?? 0;
    },

    async insertSets(rows: NewSet[]) {
      const { error } = await supabase.from("strength_sets").insert(rows.map((r) => ({ ...r, source: "manual" })));
      if (error) throw new Error("insert sets failed");
    },

    async deleteSession(sessionId) {
      const { data, error } = await supabase.from("strength_sessions").delete().eq("id", sessionId).eq("source", "manual").select("id");
      if (error || !data?.length) throw new Error("delete session failed");
    },

    async deleteSets(sessionId, positions) {
      const { data, error } = await supabase
        .from("strength_sets").delete().eq("session_id", sessionId).eq("source", "manual").in("position", positions).select("position");
      if (error || !data?.length) throw new Error("delete sets failed");
    },
  };
}
