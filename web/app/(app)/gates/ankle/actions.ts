"use server";

import { revalidatePath } from "next/cache";
import { buildAnkleGateRecord, parseAnkleAnswers } from "@/lib/gate-record";
import { createClient } from "@/lib/supabase/server";
import { todayLondon } from "@/lib/weeks";

export type GateState = { error: string | null; passed: boolean | null; message: string | null };

export async function submitAnkleGate(_prev: GateState, formData: FormData): Promise<GateState> {
  const answers = parseAnkleAnswers(formData);
  if (!answers) return { error: "Answer all four checks with Yes or No.", passed: null, message: null };

  const supabase = await createClient();
  const { data: version, error: versionError } = await supabase
    .from("plan_versions")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError || !version) return { error: "Could not find the plan. Nothing was saved.", passed: null, message: null };

  const record = buildAnkleGateRecord(answers, version.id, todayLondon());
  const { error } = await supabase.from("approvals").insert(record);
  if (error) return { error: "Could not save your answers. Nothing was changed.", passed: null, message: null };

  revalidatePath("/", "layout");
  return { error: null, passed: record.passed, message: record.note };
}
